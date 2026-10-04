#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/foliokit-store}"
CLIENT_DIR="$APP_DIR/client"
SERVER_DIR="$APP_DIR/server"
WEB_ROOT="${WEB_ROOT:-/var/www/foliokit}"
WEB_DIST="$WEB_ROOT/dist"
BRANCH="${BRANCH:-main}"
DEPLOY_COMMIT="${DEPLOY_COMMIT:-origin/$BRANCH}"
PM2_APP="${PM2_APP:-foliokit-server}"
PM2_ENTRY="dist/server/src/index.js"

trap 'echo "Deployment failed at line $LINENO" >&2' ERR

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is not installed: $1" >&2
    exit 1
  fi
}

require_env() {
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      echo "Required environment variable is missing: $name" >&2
      exit 1
    fi
  done
}

write_env_value() {
  local file="$1"
  local name="$2"
  local value="${!name-}"
  local escaped="$value"

  escaped="${escaped//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  escaped="${escaped//$'\n'/\\n}"
  escaped="${escaped//$'\r'/\\r}"
  printf '%s="%s"\n' "$name" "$escaped" >> "$file"
}

write_env_if_set() {
  local file="$1"
  local name="$2"
  if [[ -n "${!name:-}" ]]; then
    write_env_value "$file" "$name"
  fi
}

for command in git node npm pm2 nginx sudo systemctl; do
  require_command "$command"
done

if [[ ! -d "$APP_DIR/.git" || ! -d "$CLIENT_DIR" || ! -d "$SERVER_DIR" ]]; then
  echo "FOLIOKIT project was not found at $APP_DIR" >&2
  exit 1
fi

APP_DIR="$(cd "$APP_DIR" && pwd -P)"
CLIENT_DIR="$APP_DIR/client"
SERVER_DIR="$APP_DIR/server"

require_env \
  PORT NODE_ENV CLIENT_URL PUBLIC_API_URL MONGODB_URI \
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET GOOGLE_CLIENT_ID \
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
  RESEND_API_KEY EMAIL_FROM_ACCOUNT EMAIL_FROM_BILLING EMAIL_FROM_MARKETING EMAIL_REPLY_TO \
  PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_WEBHOOK_ID PAYPAL_ENVIRONMENT \
  SENTRY_DSN VITE_BASE_URL VITE_GOOGLE_CLIENT_ID VITE_GOOGLE_ANALYTICS_ID

if [[ ! "$VITE_GOOGLE_ANALYTICS_ID" =~ ^G-[A-Za-z0-9]+$ ]]; then
  echo "VITE_GOOGLE_ANALYTICS_ID must be a GA4 measurement ID beginning with G-" >&2
  exit 1
fi

echo "Deploying FOLIOKIT from $APP_DIR"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "$DEPLOY_COMMIT"
echo "Deploying commit $(git rev-parse --short HEAD)"

umask 077
CLIENT_ENV="$CLIENT_DIR/.env.production"
SERVER_ENV="$SERVER_DIR/.env.production"
: > "$CLIENT_ENV"
: > "$SERVER_ENV"
chmod 600 "$CLIENT_ENV" "$SERVER_ENV"

for name in VITE_BASE_URL VITE_GOOGLE_CLIENT_ID VITE_GOOGLE_ANALYTICS_ID; do
  write_env_value "$CLIENT_ENV" "$name"
done

for name in \
  PORT NODE_ENV CLIENT_URL PUBLIC_API_URL ACME_EMAIL MONGODB_URI \
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET ACCESS_TOKEN_TTL_MINUTES REFRESH_TOKEN_TTL_DAYS \
  GOOGLE_CLIENT_ID STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
  R2_MEDIA_URL_TTL_SECONDS R2_DOWNLOAD_URL_TTL_SECONDS \
  MAX_IMAGE_SIZE_MB MAX_VIDEO_SIZE_MB MAX_THEME_ZIP_SIZE_MB \
  ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD \
  RESEND_API_KEY EMAIL_FROM_ACCOUNT EMAIL_FROM_BILLING EMAIL_FROM_MARKETING EMAIL_REPLY_TO \
  PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET PAYPAL_WEBHOOK_ID PAYPAL_ENVIRONMENT \
  SENTRY_DSN SENTRY_RELEASE SENTRY_TRACES_SAMPLE_RATE; do
  write_env_if_set "$SERVER_ENV" "$name"
done

echo "Installing and building the client"
cd "$CLIENT_DIR"
npm ci
npm run build

echo "Installing and building the server"
cd "$SERVER_DIR"
npm ci
npm run build

if [[ ! -f "$CLIENT_DIR/dist/index.html" ]]; then
  echo "Client build did not produce dist/index.html" >&2
  exit 1
fi
if [[ ! -f "$SERVER_DIR/$PM2_ENTRY" ]]; then
  echo "Server build did not produce $PM2_ENTRY" >&2
  exit 1
fi

WEB_ROOT="$(mkdir -p "$WEB_ROOT" && cd "$WEB_ROOT" && pwd -P)"
WEB_DIST="$WEB_ROOT/dist"
case "$WEB_DIST" in
  "$WEB_ROOT"/*) ;;
  *)
    echo "Refusing to deploy outside $WEB_ROOT" >&2
    exit 1
    ;;
esac

NEXT_WEB_DIST="${WEB_DIST}.next"
PREVIOUS_WEB_DIST="${WEB_DIST}.previous"
rm -rf -- "$NEXT_WEB_DIST" "$PREVIOUS_WEB_DIST"
mkdir -p "$NEXT_WEB_DIST"
cp -R "$CLIENT_DIR/dist/." "$NEXT_WEB_DIST/"

if [[ -d "$WEB_DIST" ]]; then
  mv "$WEB_DIST" "$PREVIOUS_WEB_DIST"
fi
if ! mv "$NEXT_WEB_DIST" "$WEB_DIST"; then
  if [[ -d "$PREVIOUS_WEB_DIST" ]]; then
    mv "$PREVIOUS_WEB_DIST" "$WEB_DIST"
  fi
  exit 1
fi
rm -rf -- "$PREVIOUS_WEB_DIST"

echo "Restarting $PM2_APP"
cd "$SERVER_DIR"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start "$SERVER_DIR/$PM2_ENTRY" --name "$PM2_APP" --cwd "$SERVER_DIR"
fi
pm2 save
pm2 status "$PM2_APP"

echo "Validating and reloading Nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "FOLIOKIT deployment completed successfully"
