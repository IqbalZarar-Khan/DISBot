# 🛡️ Discord Slash Command Permissions & Security Architecture (discord.js v14)

This document outlines how DISBot configures, registers, and enforces Discord Slash Command permissions at both the Discord API level and the internal application runtime level.

---

## 1. Registration Architecture

DISBot uses guild-scoped slash command deployment (`Routes.applicationGuildCommands`) rather than global deployment. Guild commands propagate instantly across your Discord server without the 1-hour global cache delay.

### 1.1 Automated Registration with Hash Caching
To prevent hitting Discord's API rate limits (HTTP 429) during frequent bot restarts or container deployments, DISBot fingerprints the command definitions on startup:
1. `src/commands/commandData.ts` builds the array of `SlashCommandBuilder` instances.
2. `src/index.ts` computes an MD5 hash of the command payload (`commandHash`).
3. If `commandHash` matches the persisted `command_definition_hash` in `bot_config`, API deployment is skipped.
4. If changed, the new payload is deployed via `rest.put(...)` and the new hash is stored in the database.

---

## 2. Two-Tier Permission Model

DISBot enforces security using a defense-in-depth model combining Discord native UI restrictions with runtime authorization checks:

```
User enters command in Discord
          │
          ▼
[Tier 1: Discord API & UI Filter]
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  └─► If user lacks Admin, command is hidden from autocomplete
          │
          ▼ (If visible/executed)
[Tier 2: DISBot Runtime Authorization]
  checkAdminPermission(interaction)
  └─► Verifies interaction.user.id === config.rootAdminId (or current_admin_id in DB)
  └─► If unauthorized, returns ⛔ ephemeral rejection: "Only the Primary Administrator can use this command."
```

### 2.1 API-Level Permissions (`.setDefaultMemberPermissions`)

In `src/commands/commandData.ts`, administrative commands are configured with:
```typescript
new SlashCommandBuilder()
    .setName('admin')
    .setDescription('DISBot administrative management commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
```
- **Behavior**: Only users possessing the `Administrator` permission in the Discord server will see the `/admin` command in their slash command menu.
- **Why Tier 2 is still required**: Server administrators who are not the bot owner/creator must not be able to wipe mappings, expose OAuth tokens, or replay webhooks.

### 2.2 Application-Level Authorization (`checkAdminPermission`)

In `src/commands/admin/handler.ts`, all `/admin` subcommands pass through `checkAdminPermission()`:
```typescript
export async function checkAdminPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const isOwner = interaction.user.id === config.rootAdminId;
    const dbOwner = await getConfig('current_admin_id');
    const isCurrentAdmin = dbOwner ? interaction.user.id === dbOwner : isOwner;

    if (!isCurrentAdmin) {
        await interaction.reply({
            content: t('commands.admin_only'),
            ephemeral: true,
        });
        return false;
    }
    return true;
}
```

---

## 3. Ephemeral Responses for Security

All `/admin` commands defer their replies as **ephemeral** (`interaction.deferReply({ ephemeral: true })`):
- Diagnostic metrics, OAuth token status, server IP/PM2 stats, and error logs are visible **only to the executing administrator**.
- Webhook payloads containing patron display names and IDs are never leaked to public text channels.

---

## 4. Public Member-Facing Commands

Commands intended for all community members (such as `/link` for self-serve Discord-to-Patreon account linking) do **not** set restrictive default member permissions:
```typescript
new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Discord account to your Patreon membership for role sync')
    .addStringOption(option =>
        option
            .setName('identifier')
            .setDescription('Your Patreon email, display name, or member ID')
            .setRequired(true)
    )
```
- Available to all members on the server.
- The bot replies ephemerally to protect the member's private email/identifier.