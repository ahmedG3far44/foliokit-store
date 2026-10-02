```bash
#!/usr/bin/env bash

set -Eeuo pipefail

# ============================================================
# FOLIOKIT PRODUCTION DEPLOYMENT
# ============================================================

APP_DIR="/home/foliokit/foliokit-store"

CLIENT_DIR="$APP_DIR/client"
SERVER_DIR="$APP_DIR/server"

LIVE_WEB_ROOT="/var/www/foliokit"
LIVE_DIST="$LIVE_WEB_ROOT/dist"

PM2_APP="foliokit-server"
BRANCH="main"

trap 'echo "❌ Deployment failed at line $LINENO"; exit 1' ERR


echo ""
echo "=========================================="
echo "🚀 FOLIOKIT PRODUCTION DEPLOYMENT"
echo "=========================================="
echo ""


# ============================================================
# 1. MOVE TO PROJECT
# ============================================================

cd "$APP_DIR"

echo "📁 Project directory:"
echo "$APP_DIR"


# ============================================================
# 2. PULL LATEST CODE
# ============================================================

echo ""
echo "=========================================="
echo "📥 Updating repository"
echo "=========================================="

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "✅ Repository updated to origin/$BRANCH"


# ============================================================
# 3. INSTALL SERVER DEPENDENCIES
# ============================================================

echo ""
echo "=========================================="
echo "📦 Installing server dependencies"
echo "=========================================="

cd "$SERVER_DIR"

# Important:
# NODE_ENV=production may cause npm to omit devDependencies.
# TypeScript / tsc is normally a devDependency.
#
# --include=dev guarantees TypeScript and other build tools
# are installed before npm run build.

npm ci --include=dev

echo "✅ Server dependencies installed"


# Verify TypeScript exists before continuing

if [ ! -x "$SERVER_DIR/node_modules/.bin/tsc" ]; then
    echo "❌ TypeScript compiler not found in server/node_modules"
    echo ""
    echo "Make sure 'typescript' exists in server/package.json devDependencies."
    exit 1
fi

echo "✅ Server TypeScript compiler found"


# ============================================================
# 4. INSTALL CLIENT DEPENDENCIES
# ============================================================

echo ""
echo "=========================================="
echo "📦 Installing client dependencies"
echo "=========================================="

cd "$CLIENT_DIR"

npm ci --include=dev

echo "✅ Client dependencies installed"


# Verify Vite exists

if [ ! -x "$CLIENT_DIR/node_modules/.bin/vite" ]; then
    echo "❌ Vite not found in client/node_modules"
    echo ""
    echo "Make sure 'vite' exists in client/package.json devDependencies."
    exit 1
fi

echo "✅ Vite found"


# ============================================================
# 5. VALIDATE REQUIRED ENVIRONMENT VARIABLES
# ============================================================

echo ""
echo "=========================================="
echo "🔐 Validating environment variables"
echo "=========================================="

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


# ============================================================
# 6. GENERATE SERVER .ENV
# ============================================================

echo ""
echo "=========================================="
echo "📝 Generating server/.env"
echo "=========================================="

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


# ============================================================
# 7. GENERATE CLIENT .ENV
# ============================================================

echo ""
echo "=========================================="
echo "📝 Generating client/.env"
echo "=========================================="

cat > "$CLIENT_DIR/.env" <<EOF
VITE_BASE_URL=${VITE_BASE_URL}
VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
EOF

chmod 600 "$CLIENT_DIR/.env"

echo "✅ client/.env generated"


# ============================================================
# 8. BUILD SERVER
# ============================================================

echo ""
echo "=========================================="
echo "🔨 Building Express server"
echo "=========================================="

cd "$SERVER_DIR"

npm run build


# Verify dist exists

if [ ! -d "$SERVER_DIR/dist" ]; then
    echo "❌ Server build failed: server/dist was not generated"
    exit 1
fi

echo "✅ Server build completed"


# ============================================================
# 9. BUILD CLIENT
# ============================================================

echo ""
echo "=========================================="
echo "🔨 Building React client"
echo "=========================================="

cd "$CLIENT_DIR"

npm run build


# Verify dist exists

if [ ! -d "$CLIENT_DIR/dist" ]; then
    echo "❌ Client build failed: client/dist was not generated"
    exit 1
fi

if [ ! -f "$CLIENT_DIR/dist/index.html" ]; then
    echo "❌ Client build failed: dist/index.html does not exist"
    exit 1
fi

echo "✅ Client build completed"


# ============================================================
# 10. DEPLOY REACT FRONTEND
# ============================================================

echo ""
echo "=========================================="
echo "🌐 Deploying React frontend"
echo "=========================================="

NEW_DIST="$LIVE_WEB_ROOT/dist-new"
OLD_DIST="$LIVE_WEB_ROOT/dist-old"


# Remove stale temp deployment

rm -rf "$NEW_DIST"


# Create fresh deployment directory

mkdir -p "$NEW_DIST"


# Copy new React build

cp -a "$CLIENT_DIR/dist/." "$NEW_DIST/"


# File permissions
#
# Directories: rwxr-xr-x
# Files:       rw-r--r--

find "$NEW_DIST" -type d -exec chmod 755 {} \;
find "$NEW_DIST" -type f -exec chmod 644 {} \;


# Remove old backup if one exists

rm -rf "$OLD_DIST"


# Move current production build to backup

if [ -d "$LIVE_DIST" ]; then
    mv "$LIVE_DIST" "$OLD_DIST"
fi


# Promote new build

mv "$NEW_DIST" "$LIVE_DIST"

echo "✅ Frontend deployed:"
echo "$LIVE_DIST"


# ============================================================
# 11. RESTART EXPRESS API
# ============================================================

echo ""
echo "=========================================="
echo "♻️ Restarting Express API"
echo "=========================================="

cd "$SERVER_DIR"


# Make sure process exists

if ! pm2 describe "$PM2_APP" >/dev/null 2>&1; then
    echo "❌ PM2 process '$PM2_APP' was not found"
    exit 1
fi


pm2 restart "$PM2_APP" --update-env

pm2 save

echo "✅ PM2 process restarted:"
echo "$PM2_APP"


# ============================================================
# 12. TEST NGINX
# ============================================================

echo ""
echo "=========================================="
echo "🔎 Testing Nginx configuration"
echo "=========================================="

sudo nginx -t

echo "✅ Nginx configuration valid"


# ============================================================
# 13. RELOAD NGINX
# ============================================================

echo ""
echo "=========================================="
echo "♻️ Reloading Nginx"
echo "=========================================="

sudo systemctl reload nginx

echo "✅ Nginx reloaded"


# ============================================================
# 14. REMOVE PREVIOUS FRONTEND BACKUP
# ============================================================

if [ -d "$OLD_DIST" ]; then
    rm -rf "$OLD_DIST"
fi


# ============================================================
# 15. FINAL STATUS
# ============================================================

echo ""
echo "=========================================="
echo "✅ FOLIOKIT DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""

echo "Frontend:"
echo "https://foliokit.store"

echo ""

echo "API:"
echo "https://api.foliokit.store"

echo ""

echo "PM2 status:"
pm2 status "$PM2_APP"

echo ""

echo "Deployment completed successfully."
```