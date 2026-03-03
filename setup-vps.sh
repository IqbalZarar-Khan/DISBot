#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
#  DISBot VPS Setup Script
#  Installs Caddy (automatic HTTPS), configures reverse proxy,
#  and provisions Let's Encrypt SSL — all in one command.
#
#  Usage:
#    chmod +x setup-vps.sh
#    sudo ./setup-vps.sh your-domain.com
#
#  Prerequisites:
#    - Ubuntu 20.04+ / Debian 11+
#    - A domain pointing to this server's IP (A record)
#    - Port 80 and 443 open in firewall
# ───────────────────────────────────────────────────────────────────────

set -euo pipefail

DOMAIN="${1:-}"
BOT_PORT="${2:-3000}"

if [[ -z "$DOMAIN" ]]; then
    echo "❌ Usage: sudo ./setup-vps.sh <your-domain.com> [bot-port]"
    echo "   Example: sudo ./setup-vps.sh bot.example.com 3000"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  🤖 DISBot VPS Setup"
echo "  Domain: $DOMAIN"
echo "  Bot Port: $BOT_PORT"
echo "═══════════════════════════════════════════════"
echo ""

# ── 1. Install Node.js 20 ────────────────────────────────────────────
echo "📦 Step 1/5: Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "✅ Node.js $(node -v) installed"
else
    echo "✅ Node.js $(node -v) already installed"
fi

# ── 2. Install PM2 ───────────────────────────────────────────────────
echo "📦 Step 2/5: Installing PM2..."
if ! command -v pm2 &>/dev/null; then
    npm install -g pm2
    echo "✅ PM2 installed"
else
    echo "✅ PM2 already installed"
fi

# ── 3. Install Caddy ────────────────────────────────────────────────
echo "📦 Step 3/5: Installing Caddy (automatic HTTPS)..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    echo "✅ Caddy installed"
else
    echo "✅ Caddy already installed"
fi

# ── 4. Configure Caddy reverse proxy ────────────────────────────────
echo "⚙️  Step 4/5: Configuring Caddy reverse proxy..."
CADDYFILE="/etc/caddy/Caddyfile"
cat > "$CADDYFILE" <<EOF
$DOMAIN {
    reverse_proxy localhost:$BOT_PORT

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Logging
    log {
        output file /var/log/caddy/disbot.log
    }
}
EOF

mkdir -p /var/log/caddy
systemctl enable caddy
systemctl restart caddy
echo "✅ Caddy configured for $DOMAIN → localhost:$BOT_PORT"

# ── 5. Setup PM2 for the bot ────────────────────────────────────────
echo "🚀 Step 5/5: Setting up PM2..."

# Install dependencies if node_modules doesn't exist
if [[ ! -d "node_modules" ]]; then
    npm install
fi

# Build
npm run build

# Start with PM2
pm2 delete disbot 2>/dev/null || true
pm2 start dist/index.js --name disbot
pm2 save
pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" 2>/dev/null || pm2 startup

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✅ DISBot VPS Setup Complete!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  🌐 Bot URL: https://$DOMAIN"
echo "  📡 Webhook: https://$DOMAIN/webhooks/patreon"
echo "  🔄 OAuth:   https://$DOMAIN/oauth/start"
echo ""
echo "  PM2 Commands:"
echo "    pm2 logs disbot     — View logs"
echo "    pm2 restart disbot  — Restart bot"
echo "    pm2 status          — Check status"
echo ""
echo "  Caddy auto-provisions SSL from Let's Encrypt."
echo "  No manual certificate setup needed! 🎉"
echo ""
