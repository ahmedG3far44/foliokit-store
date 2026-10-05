#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# FOLIOKIT Production Deployment
# ============================================================

APP_DIR="${APP_DIR:-/home/foliokit/foliokit-store}"

CLIENT_DIR="${CLIENT_DIR:-$APP_DIR/client}"
SERVER_DIR="${SERVER_DIR:-$APP_DIR/server}"

WEB_ROOT="${WEB_ROOT:-/var/www/foliokit}"

CLIENT_ENV="$CLIENT_DIR/.env"
SERVER_ENV="$SERVER_DIR/.env"

PM2_APP="${PM2_APP:-foliokit-server}"
BRANCH="${BRANCH:-main}"


# ============================================================
# Error handler
# ============================================================

error_handler() {
    local exit_code=$?
    local line_number=$1

    echo ""
    echo "============================================================"
    echo "❌ DEPLOYMENT FAILED"
    echo "============================================================"
    echo "Line: $line_number"
    echo "Exit code: $exit_code"
    echo "============================================================"

    exit "$exit_code"
}

trap 'error_handler $LINENO' ERR


# ============================================================
# Header
# ============================================================

echo ""
echo "============================================================"
echo "🚀 FOLIOKIT PRODUCTION DEPLOYMENT"
echo "============================================================"
echo "App:        $APP_DIR"
echo "Client:     $CLIENT_DIR"
echo "Server:     $SERVER_DIR"
echo "Web root:   $WEB_ROOT"
echo "PM2 app:    $PM2_APP"
echo "Branch:     $BRANCH"
echo "Commit:     ${DEPLOY_COMMIT:-unknown}"
echo "============================================================"
echo ""


# ============================================================
# Validate directories
# ============================================================

echo "🔎 Checking project directories..."

if [ ! -d "$APP_DIR" ]; then
    echo "❌ App directory does not exist:"
    echo "$APP_DIR"
    exit 1
fi

if [ ! -d "$CLIENT_DIR" ]; then
    echo "❌ Client directory does not exist:"
    echo "$CLIENT_DIR"
    exit 1
fi

if [ ! -d "$SERVER_DIR" ]; then
    echo "❌ Server directory does not exist:"
    echo "$SERVER_DIR"
    exit 1
fi

echo "✅ Directories found"


# ============================================================
# Pull latest source code
# ============================================================

echo ""
echo "============================================================"
echo "📥 Updating source code"
echo "============================================================"

cd "$APP_DIR"

git fetch origin "$BRANCH"

git checkout "$BRANCH"

git pull --ff-only origin "$BRANCH"

echo ""
echo "Current commit:"
git log -1 --oneline

echo "✅ Source code updated"


# ============================================================
# CLIENT DEPLOYMENT
# ============================================================

echo ""
echo "============================================================"
echo "🌐 Deploying CLIENT"
echo "============================================================"

cd "$CLIENT_DIR"


# ------------------------------------------------------------
# Create client .env
# ------------------------------------------------------------

echo "📝 Updating client .env..."

umask 077

cat > "$CLIENT_ENV" <<EOF
VITE_BASE_URL=${VITE_BASE_URL:-}
VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID:-}
VITE_GOOGLE_ANALYTICS_ID=${VITE_GOOGLE_ANALYTICS_ID:-}
EOF

chmod 600 "$CLIENT_ENV"

echo "✅ Client .env updated"


# ------------------------------------------------------------
# Install client dependencies
# ------------------------------------------------------------

echo ""
echo "📦 Installing client dependencies..."

npm install

echo "✅ Client dependencies installed"


# ------------------------------------------------------------
# Build client
# ------------------------------------------------------------

echo ""
echo "🏗️ Building client..."

npm run build

echo "✅ Client build completed"


# ------------------------------------------------------------
# Validate dist
# ------------------------------------------------------------

if [ ! -d "$CLIENT_DIR/dist" ]; then
    echo "❌ Client dist directory was not generated"
    exit 1
fi


# ------------------------------------------------------------
# Deploy client build
# ------------------------------------------------------------

echo ""
echo "📂 Deploying client to $WEB_ROOT..."

sudo mkdir -p "$WEB_ROOT"

# Remove previous build
sudo rm -rf "$WEB_ROOT/dist"

# Copy new build
sudo cp -r "$CLIENT_DIR/dist" "$WEB_ROOT/"

echo "✅ Client deployed to:"
echo "$WEB_ROOT/dist"


# ============================================================
# SERVER DEPLOYMENT
# ============================================================

echo ""
echo "============================================================"
echo "⚙️ Deploying SERVER"
echo "============================================================"

cd "$SERVER_DIR"


# ------------------------------------------------------------
# Create server .env
# ------------------------------------------------------------

echo "📝 Updating server .env..."

umask 077

cat > "$SERVER_ENV" <<EOF
# ============================================================
# Application
# ============================================================

PORT=${PORT:-5000}
NODE_ENV=${NODE_ENV:-production}

CLIENT_URL=${CLIENT_URL:-}
PUBLIC_API_URL=${PUBLIC_API_URL:-}
ACME_EMAIL=${ACME_EMAIL:-}


# ============================================================
# Database
# ============================================================

MONGODB_URI=${MONGODB_URI:-}


# ============================================================
# Authentication
# ============================================================

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET:-}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET:-}

ACCESS_TOKEN_TTL_MINUTES=${ACCESS_TOKEN_TTL_MINUTES:-}
REFRESH_TOKEN_TTL_DAYS=${REFRESH_TOKEN_TTL_DAYS:-}

GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}


# ============================================================
# Stripe
# ============================================================

STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}


# ============================================================
# Cloudflare R2
# ============================================================

CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-}

R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}

R2_BUCKET=${R2_BUCKET:-}

R2_MEDIA_URL_TTL_SECONDS=${R2_MEDIA_URL_TTL_SECONDS:-3600}
R2_DOWNLOAD_URL_TTL_SECONDS=${R2_DOWNLOAD_URL_TTL_SECONDS:-90}


# ============================================================
# Upload limits
# ============================================================

MAX_IMAGE_SIZE_MB=${MAX_IMAGE_SIZE_MB:-}
MAX_VIDEO_SIZE_MB=${MAX_VIDEO_SIZE_MB:-}
MAX_THEME_ZIP_SIZE_MB=${MAX_THEME_ZIP_SIZE_MB:-}


# ============================================================
# Admin
# ============================================================

ADMIN_EMAIL=${ADMIN_EMAIL:-}
ADMIN_NAME=${ADMIN_NAME:-}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}


# ============================================================
# Email / Resend
# ============================================================

RESEND_API_KEY=${RESEND_API_KEY:-}

EMAIL_FROM_ACCOUNT=${EMAIL_FROM_ACCOUNT:-}
EMAIL_FROM_BILLING=${EMAIL_FROM_BILLING:-}
EMAIL_FROM_MARKETING=${EMAIL_FROM_MARKETING:-}
EMAIL_REPLY_TO=${EMAIL_REPLY_TO:-}


# ============================================================
# PayPal
# ============================================================

PAYPAL_CLIENT_ID=${PAYPAL_CLIENT_ID:-}
PAYPAL_CLIENT_SECRET=${PAYPAL_CLIENT_SECRET:-}

PAYPAL_WEBHOOK_ID=${PAYPAL_WEBHOOK_ID:-}
PAYPAL_ENVIRONMENT=${PAYPAL_ENVIRONMENT:-}


# ============================================================
# Sentry
# ============================================================

SENTRY_DSN=${SENTRY_DSN:-}
SENTRY_RELEASE=${SENTRY_RELEASE:-}
SENTRY_TRACES_SAMPLE_RATE=${SENTRY_TRACES_SAMPLE_RATE:-0.1}
EOF

chmod 600 "$SERVER_ENV"

echo "✅ Server .env updated"


# ------------------------------------------------------------
# Install server dependencies
# ------------------------------------------------------------

echo ""
echo "📦 Installing server dependencies..."

npm install

echo "✅ Server dependencies installed"


# ------------------------------------------------------------
# Build server
# ------------------------------------------------------------

echo ""
echo "🏗️ Building server..."

npm run build

echo "✅ Server build completed"


# ============================================================
# Restart PM2
# ============================================================

echo ""
echo "============================================================"
echo "♻️ Restarting server"
echo "============================================================"

if pm2 describe "$PM2_APP" > /dev/null 2>&1; then

    echo "Restarting existing PM2 process..."

    pm2 restart "$PM2_APP" --update-env

else

    echo "❌ PM2 application '$PM2_APP' does not exist."
    echo ""
    echo "Create it first, for example:"
    echo ""
    echo "cd $SERVER_DIR"
    echo "pm2 start dist/index.js --name $PM2_APP"
    echo "pm2 save"

    exit 1

fi

echo "✅ PM2 server restarted"


# ============================================================
# Nginx validation
# ============================================================

echo ""
echo "============================================================"
echo "🔎 Checking Nginx"
echo "============================================================"

sudo nginx -t

echo "✅ Nginx configuration valid"


# ============================================================
# Reload Nginx
# ============================================================

echo ""
echo "♻️ Reloading Nginx..."

sudo systemctl reload nginx

echo "✅ Nginx reloaded"


# ============================================================
# PM2 status
# ============================================================

echo ""
echo "============================================================"
echo "📊 PM2 Status"
echo "============================================================"

pm2 status "$PM2_APP"


# ============================================================
# Deployment complete
# ============================================================

echo ""
echo "============================================================"
echo "✅ FOLIOKIT DEPLOYMENT COMPLETED"
echo "============================================================"
echo "Commit:     ${DEPLOY_COMMIT:-unknown}"
echo "Client:     $WEB_ROOT/dist"
echo "Server:     $PM2_APP"
echo "Environment: production"
echo "============================================================"
echo ""