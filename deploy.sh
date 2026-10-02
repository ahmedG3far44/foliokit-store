#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="/home/foliokit/foliokit-store"
CLIENT_DIR="$APP_DIR/client"
SERVER_DIR="$APP_DIR/server"

LIVE_WEB_ROOT="/var/www/foliokit"
LIVE_DIST="$LIVE_WEB_ROOT/dist"

PM2_APP="foliokit-server"
BRANCH="main"

trap 'echo "❌ Deployment failed at line $LINENO"; exit 1' ERR

echo "=========================================="
echo "🚀 FOLIOKIT PRODUCTION DEPLOYMENT"
echo "=========================================="

cd "$APP_DIR"

# ----------------------------------------------------------
# 1. Pull latest code
# ----------------------------------------------------------

echo "📥 Updating repository..."

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "✅ Repository updated"


# ----------------------------------------------------------
# 2. Validate required secrets
# ----------------------------------------------------------

echo "🔐 Validating environment variables..."

required_vars=(
  PORT
  NODE_ENV
  CLIENT_URL
  PUBLIC_API_URL
  MONGODB_URI

  JWT_ACCESS_SECRET
  JWT_REFRESH_SECRET

  GOOGLE_CLIENT_ID

  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET

  RESEND_API_KEY

  VITE_BASE_URL
  VITE_GOOGLE_CLIENT_ID
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "❌ Missing required environment variable: $var"
    exit 1
  fi
done

echo "✅ Required environment variables exist"


# ----------------------------------------------------------
# 3. Generate server/.env
# ----------------------------------------------------------

echo "📝 Generating server/.env..."

cat > "$SERVER_DIR/.env" <<EOF
PORT=${PORT}
NODE_ENV=${NODE_ENV}

CLIENT_URL=${CLIENT_URL}
PUBLIC_API_URL=${PUBLIC_API_URL}
ACME_EMAIL=${ACME_EMAIL:-}

MONGODB_URI=${MONGODB_URI}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ACCESS_TOKEN_TTL_MINUTES=${ACCESS_TOKEN_TTL_MINUTES:-15}
REFRESH_TOKEN_TTL_DAYS=${REFRESH_TOKEN_TTL_DAYS:-30}

GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}

STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}
R2_BUCKET=${R2_BUCKET:-}

R2_MEDIA_URL_TTL_SECONDS=${R2_MEDIA_URL_TTL_SECONDS:-3600}
R2_DOWNLOAD_URL_TTL_SECONDS=${R2_DOWNLOAD_URL_TTL_SECONDS:-3600}

LOCAL_UPLOAD_DIR=${LOCAL_UPLOAD_DIR:-}
LOCAL_MEDIA_BASE_URL=${LOCAL_MEDIA_BASE_URL:-}

MAX_IMAGE_SIZE_MB=${MAX_IMAGE_SIZE_MB:-10}
MAX_VIDEO_SIZE_MB=${MAX_VIDEO_SIZE_MB:-100}
MAX_THEME_ZIP_SIZE_MB=${MAX_THEME_ZIP_SIZE_MB:-500}

ADMIN_EMAIL=${ADMIN_EMAIL:-}
ADMIN_NAME=${ADMIN_NAME:-}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}

RESEND_API_KEY=${RESEND_API_KEY}

EMAIL_FROM_ACCOUNT=${EMAIL_FROM_ACCOUNT:-}
EMAIL_FROM_BILLING=${EMAIL_FROM_BILLING:-}
EMAIL_FROM_MARKETING=${EMAIL_FROM_MARKETING:-}
EMAIL_REPLY_TO=${EMAIL_REPLY_TO:-}

PAYPAL_CLIENT_ID=${PAYPAL_CLIENT_ID:-}
PAYPAL_CLIENT_SECRET=${PAYPAL_CLIENT_SECRET:-}
PAYPAL_WEBHOOK_ID=${PAYPAL_WEBHOOK_ID:-}
PAYPAL_ENVIRONMENT=${PAYPAL_ENVIRONMENT:-}

PAYMOB_SECRET_KEY=${PAYMOB_SECRET_KEY:-}
PAYMOB_PUBLIC_KEY=${PAYMOB_PUBLIC_KEY:-}
PAYMOB_INTEGRATION_ID=${PAYMOB_INTEGRATION_ID:-}
PAYMOB_INTEGRATION_IDS=${PAYMOB_INTEGRATION_IDS:-}
PAYMOB_HMAC_SECRET=${PAYMOB_HMAC_SECRET:-}
PAYMOB_BASE_URL=${PAYMOB_BASE_URL:-}
PAYMOB_CURRENCY=${PAYMOB_CURRENCY:-}
EOF

chmod 600 "$SERVER_DIR/.env"

echo "✅ server/.env generated"


# ----------------------------------------------------------
# 4. Generate client/.env
# ----------------------------------------------------------

echo "📝 Generating client/.env..."

cat > "$CLIENT_DIR/.env" <<EOF
VITE_BASE_URL=${VITE_BASE_URL}
VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
EOF

chmod 600 "$CLIENT_DIR/.env"

echo "✅ client/.env generated"


# ----------------------------------------------------------
# 5. Build server
# ----------------------------------------------------------

echo "📦 Installing server dependencies..."

cd "$SERVER_DIR"

npm ci

echo "🔨 Building server..."

npm run build

echo "✅ Server built"


# ----------------------------------------------------------
# 6. Build client
# ----------------------------------------------------------

echo "📦 Installing client dependencies..."

cd "$CLIENT_DIR"

npm ci

echo "🔨 Building client..."

npm run build

if [ ! -d "$CLIENT_DIR/dist" ]; then
  echo "❌ Client build failed: dist directory not found"
  exit 1
fi

echo "✅ Client built"


# ----------------------------------------------------------
# 7. Deploy frontend
# ----------------------------------------------------------

echo "🌐 Deploying frontend..."

NEW_DIST="$LIVE_WEB_ROOT/dist-new"
OLD_DIST="$LIVE_WEB_ROOT/dist-old"

rm -rf "$NEW_DIST"
mkdir -p "$NEW_DIST"

cp -a "$CLIENT_DIR/dist/." "$NEW_DIST/"

chmod -R 755 "$NEW_DIST"

rm -rf "$OLD_DIST"

if [ -d "$LIVE_DIST" ]; then
  mv "$LIVE_DIST" "$OLD_DIST"
fi

mv "$NEW_DIST" "$LIVE_DIST"

echo "✅ Frontend deployed"


# ----------------------------------------------------------
# 8. Restart Express API
# ----------------------------------------------------------

echo "♻️ Restarting PM2 server..."

cd "$SERVER_DIR"

pm2 restart "$PM2_APP" --update-env
pm2 save

echo "✅ PM2 restarted"


# ----------------------------------------------------------
# 9. Validate Nginx
# ----------------------------------------------------------

echo "🔎 Testing Nginx..."

sudo nginx -t


# ----------------------------------------------------------
# 10. Reload Nginx
# ----------------------------------------------------------

echo "♻️ Reloading Nginx..."

sudo systemctl reload nginx

echo "✅ Nginx reloaded"


# ----------------------------------------------------------
# 11. Remove old frontend
# ----------------------------------------------------------

rm -rf "$OLD_DIST"


# ----------------------------------------------------------
# 12. Final status
# ----------------------------------------------------------

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Frontend:"
echo "https://foliokit.store"
echo ""
echo "API:"
echo "https://api.foliokit.store"
echo ""

pm2 status "$PM2_APP"