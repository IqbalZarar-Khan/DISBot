# 🤖 Patreon Tier-Waterfall Bot

A Discord bot that automates content distribution from Patreon to Discord using a tiered "waterfall" release strategy. The bot tracks when content becomes available to different patron tiers and notifies the appropriate Discord channels in real-time.

## ✨ Features

- **🎯 Waterfall Release System**: Automatically alerts Discord channels when content becomes available to their tier
- **👥 Member Tracking**: Monitors new pledges, upgrades, and departures
- **🔒 Secure Admin Panel**: User ID-based authentication for admin commands
- **📊 Real-time Webhooks**: Instant notifications via Patreon webhooks
- **💎 Tier Management**: Easy mapping of Patreon tiers to Discord channels

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Discord bot token ([Create one here](https://discord.com/developers/applications))
- A Patreon Creator account with OAuth app ([Setup guide](https://www.patreon.com/portal/registration/register-clients))
- A server with HTTPS support for webhooks (VPS, ngrok, etc.)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd DISBot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Deploy slash commands**
   ```bash
   npm run deploy-commands
   ```

6. **Start the bot**
   ```bash
   npm start
   # For development with auto-reload:
   npm run dev
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
ROOT_ADMIN_ID=your_discord_user_id
LOG_CHANNEL_ID=channel_for_logs (optional)

# Patreon Configuration
PATREON_CLIENT_ID=your_patreon_client_id
PATREON_CLIENT_SECRET=your_patreon_client_secret
PATREON_ACCESS_TOKEN=your_patreon_access_token
PATREON_REFRESH_TOKEN=your_patreon_refresh_token
PATREON_CAMPAIGN_ID=your_campaign_id

# Webhook Configuration
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_PORT=3000

# Database
DATABASE_PATH=./data/bot.db
```

### Initial Setup

1. **Invite the bot to your server** with these permissions:
   - Send Messages
   - Embed Links
   - Use Slash Commands

2. **Configure tier mappings** using `/admin set-channel`:
   ```
   /admin set-channel tier_name:Diamond channel:#diamond-alerts
   /admin set-channel tier_name:Gold channel:#gold-alerts
   /admin set-channel tier_name:Silver channel:#silver-alerts
   ```

3. **Test the setup**:
   ```
   /admin status
   /admin test-alert tier_name:Diamond
   ```

## 📚 Admin Commands

All admin commands are restricted to the user specified in `ROOT_ADMIN_ID`.

| Command | Description |
|---------|-------------|
| `/admin status` | Display bot status and configuration |
| `/admin set-channel <tier> <channel>` | Map a Patreon tier to a Discord channel |
| `/admin set-owner <user>` | Transfer bot control to another user |
| `/admin test-alert <tier>` | Send a test alert to verify setup |

## 🔄 How It Works

### Waterfall Release Strategy

1. **New Content**: When you publish a chapter for Diamond tier, the bot alerts #diamond-alerts
2. **Tier Update**: When you change access from Diamond to Gold, the bot alerts #gold-alerts
3. **Cascade**: Continue lowering tiers, and each channel gets notified when they gain access

### Member Tracking

- **New Pledge**: Bot logs new members and their tier
- **Upgrade**: Bot detects and celebrates tier upgrades
- **Departure**: Bot logs when members end their pledge

## 🛠️ Development

### Project Structure

```
src/
├── commands/           # Slash command handlers
│   ├── admin/         # Admin-only commands
│   └── deploy-commands.ts
├── database/          # Database layer
│   ├── db.ts         # SQL.js operations
│   └── schema.ts     # TypeScript interfaces
├── middleware/        # Authorization middleware
├── utils/            # Utility functions
│   ├── embedBuilder.ts
│   ├── logger.ts
│   └── tierRanking.ts
├── webhooks/         # Webhook server and handlers
│   ├── handlers/     # Event-specific handlers
│   ├── server.ts
│   └── verify.ts
├── config.ts         # Configuration management
└── index.ts          # Main entry point
```

### Scripts

- `npm run dev` - Start with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run production build
- `npm run deploy-commands` - Register slash commands
- `npm test` - Run tests

## 🔐 Security

- **User ID Whitelisting**: Only the root admin can execute admin commands
- **Webhook Verification**: All Patreon webhooks are verified using HMAC signatures
- **Environment Variables**: Sensitive data stored in `.env` (never committed)

## 📝 License

MIT

## 🤝 Support

For issues or questions, please open an issue on GitHub.
