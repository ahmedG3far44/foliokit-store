#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly COMPOSE_FILE="$SCRIPT_DIR/docker-compose.production.yaml"
readonly COMPOSE_PROJECT="foliokit-production"

compose() {
  docker compose --project-name "$COMPOSE_PROJECT" --file "$COMPOSE_FILE" "$@"
}

deployment_failed() {
  local exit_code=$?
  echo "Deployment failed (exit code $exit_code). Current service state:"
  compose ps || true
  echo "Recent service logs:"
  compose logs --tail=100 server nginx certbot || true
  exit "$exit_code"
}

trap deployment_failed ERR

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Production deployment must run on the Linux VPS."
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is not installed."; exit 1; }
docker info >/dev/null 2>&1 || { echo "The runner user cannot access the Docker daemon."; exit 1; }

required_variables=(
  ACME_EMAIL
  MONGODB_URI
  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET
  GOOGLE_CLIENT_ID
  VITE_GOOGLE_CLIENT_ID
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  CLOUDFLARE_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  RESEND_API_KEY
  EMAIL_FROM_ACCOUNT
  EMAIL_FROM_BILLING
  EMAIL_FROM_MARKETING
  EMAIL_REPLY_TO
  PAYPAL_CLIENT_ID
  PAYPAL_CLIENT_SECRET
  PAYPAL_WEBHOOK_ID
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required production variable: $variable"
    exit 1
  fi
done

if [[ "$GOOGLE_CLIENT_ID" != "$VITE_GOOGLE_CLIENT_ID" ]]; then
  echo "GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID must contain the same Google web client ID."
  exit 1
fi

if [[ "${VITE_BASE_URL:-https://api.foliokit.store/api/v1}" != "https://api.foliokit.store/api/v1" ]]; then
  echo "VITE_BASE_URL must be https://api.foliokit.store/api/v1 for this production deployment."
  exit 1
fi

if [[ "${PAYPAL_ENVIRONMENT:-live}" != "live" ]]; then
  echo "PAYPAL_ENVIRONMENT must be live for the production deployment."
  exit 1
fi

cd "$SCRIPT_DIR"

echo "Validating the production Compose configuration..."
compose config --quiet

echo "Building and testing the API image..."
docker build --file server/Dockerfile --target test --tag foliokit-server:test .

echo "Building and linting the client image..."
docker build \
  --file client/Dockerfile \
  --target test \
  --build-arg "VITE_BASE_URL=${VITE_BASE_URL:-https://api.foliokit.store/api/v1}" \
  --build-arg "VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID" \
  --tag foliokit-client:test \
  .

echo "Building production images..."
compose build --pull
compose pull certbot

echo "Checking MongoDB Atlas, Cloudflare R2, Stripe, PayPal, and email configuration..."
compose run --rm --no-deps server npm run preflight:compiled

echo "Starting the production stack..."
compose up --detach --remove-orphans --wait --wait-timeout 180

echo "Checking the API from inside the production network..."
compose exec --no-TTY server node -e \
  "fetch('http://127.0.0.1:5000/health/ready').then(async response => { if (!response.ok) throw new Error(await response.text()); console.log(await response.text()); })"

echo "Waiting for the trusted HTTPS certificate and public endpoints..."
https_ready=false
for _attempt in $(seq 1 36); do
  if curl --fail --silent --show-error --max-time 10 https://api.foliokit.store/health/ready >/dev/null 2>&1 \
    && curl --fail --silent --show-error --max-time 10 https://foliokit.store/health >/dev/null 2>&1; then
    https_ready=true
    break
  fi
  sleep 5
done

if [[ "$https_ready" != "true" ]]; then
  echo "The containers are healthy, but the public HTTPS endpoints are not trusted/reachable. Check DNS, ports 80/443, and the Certbot logs."
  exit 1
fi

compose ps
docker image prune --force >/dev/null

echo "Deployment complete: https://foliokit.store and https://api.foliokit.store"
