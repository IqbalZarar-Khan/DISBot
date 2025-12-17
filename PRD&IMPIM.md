# 📄 Product Requirements Document (PRD): Patreon-Discord Content Distribution Bot

| Metadata | Details |
| :--- | :--- |
| **Project Name** | Patreon Tier-Waterfall Bot |
| **Version** | 1.0 |
| **Platform** | Node.js / Discord.js v14+ |
| **Integrations** | Patreon API (OAuth + Webhooks) |
| **Target Audience** | Patreon Creators with tiered release schedules |

---

## 1. Executive Summary
This bot automates the delivery of Patreon content updates to a Discord server. Its core functionality is to handle a **"Waterfall Release Strategy"**: identifying when a chapter (post) is uploaded or updated, determining which Tier now has access, and alerting the specific corresponding Discord channel. It also tracks member pledges and upgrades in real-time, managed via a secure internal admin panel.

---

## 2. System Architecture

### 2.1 Data Flow
1.  **Patreon Webhooks:** The bot listens for real-time events (`posts:publish`, `posts:update`, `members:create`, `members:update`).
2.  **API Verification:** All incoming webhooks must be verified using the `X-Patreon-Signature` to prevent spoofing.
3.  **State Comparison:** For every post update, the bot compares the *current* access permissions against the *previously stored* permissions in its local database to decide if a new alert is needed.
4.  **Discord Output:** The bot uses the Discord API to send Embeds to specific Channel IDs.

### 2.2 Integration Requirements
* **Patreon API v2:**
    * **OAuth Scopes:** `campaigns`, `campaigns.members`, `campaigns.posts`, `campaigns.posts:readonly` (to fetch tags/collections).
    * **Endpoints:** `/v2/campaigns/{id}/posts` (to fetch full details if webhook payload is partial).
* **Discord Bot:**
    * **Permissions:** `Send Messages`, `Embed Links`, `Use External Emojis`, `Slash Commands`.
    * **Intents:** `Guilds`, `GuildMembers`.

---

## 3. Functional Requirements: Core Features

### 3.1 Content Alerting Engine ("The Waterfall")

**Goal:** Alert the correct tier when they gain access to a chapter.

* **R1: New Chapter Upload (`posts:publish`)**
    * **Trigger:** Creator uploads a new chapter (e.g., for Diamond Tier).
    * **Logic:**
        1.  Bot receives webhook.
        2.  Bot checks the `included` tier data to see the **minimum required tier** to view the post.
        3.  Bot saves this state to the database (e.g., `PostID: 123` = `Tier: Diamond`).
        4.  Bot sends an alert to the **Diamond Channel**.
    * **Alert Content:** Title, Link, Tags, Collection Name.

* **R2: Chapter Access Update (`posts:update`)**
    * **Trigger:** Creator edits a post to lower the access requirement (e.g., Diamond $\rightarrow$ Gold).
    * **Logic:**
        1.  Bot receives `posts:update` webhook.
        2.  Bot fetches the stored state for this `PostID`.
        3.  **Comparison:**
            * *Old State:* Diamond
            * *New State:* Gold
        4.  **Decision:** Since the tier requirement dropped (meaning *new* people can see it), the bot identifies the **Gold Channel**.
        5.  Bot sends an alert to the **Gold Channel**: *"Update: This chapter is now available for Gold members!"*
        6.  Bot updates the database: `PostID: 123` = `Tier: Gold`.
    * *Note:* If the post is just edited for typos (Tier remains Diamond), **no** alert is sent to avoid spam.

### 3.2 Member Tracking

* **R3: New Pledges (`members:create`)**
    * **Action:** When a user pledges, fetch their `full_name` and `currently_entitled_tiers`.
    * **Output:** Send a message to a general welcome or admin-log channel:
        > "🎉 **New Member:** [Name] has pledged to the **[Tier Name]** tier!"

* **R4: Upgrades (`members:update`)**
    * **Logic:** Compare the `new_tier_id` in the payload against the user's `old_tier_id` (requires tracking users in DB).
    * **Condition:** IF `new_value` > `old_value` (requires logic to rank tiers).
    * **Output:** Send a specific upgrade alert:
        > "📈 **Upgrade:** [Name] just upgraded to **[New Tier]**! Welcome to the inner circle."

### 3.3 Alert Formatting
* **R5: Embed Structure**
    * **Title:** Chapter Title (e.g., "Chapter 55: The Awakening")
    * **URL:** Direct link to Patreon post.
    * **Fields:**
        * `Collections`: (e.g., "Arc 3", "Side Stories")
        * `Tags`: (e.g., #Fantasy, #Draft)
    * **Color:** Dynamic based on Tier (Diamond = Cyan, Gold = Gold, etc.)

---

## 4. Functional Requirements: Admin Panel & Permissions

### 4.1 Security Architecture ("The Gatekeeper")

* **R6: Authentication Logic:**
    * Unlike standard Discord permissions, this bot uses **User ID Whitelisting**.
    * **Logic:** Before executing any `/admin` command, the bot checks: `if (interaction.user.id !== config.ROOT_ADMIN_ID) return reply("⛔ Access Denied");`
* **R7: Initialization:**
    * The "Root Admin ID" must be set in the secure environment variables (`.env` file) during hosting setup.

### 4.2 Admin Commands (Slash Commands)

All responses in this section must be **Ephemeral** (visible only to the admin).

* **C1: Set/Update Admin**
    * **Command:** `/admin set-owner <user_mention>`
    * **Action:** Transfers bot control to a new user ID in the database.

* **C2: Status & Diagnostics**
    * **Command:** `/admin status`
    * **Output:**
        * **Patreon API:** 🟢 Connected / 🔴 Error
        * **Webhooks:** 🟢 Listening
        * **Mapped Tiers:** Diamond ➡️ #diamond-channel, Gold ➡️ #gold-channel

* **C3: Force Sync**
    * **Command:** `/admin force-sync`
    * **Action:** Manually triggers a full fetch of Members and Posts from the Patreon API.
    * **Use Case:** Recovering data if the bot was offline during a webhook event.

* **C4: Test Alert**
    * **Command:** `/admin test-alert <tier_name>`
    * **Action:** Sends a dummy alert to the specified public channel to verify formatting and permissions.

---

## 5. Database Schema

A lightweight database (SQLite or MongoDB) is required to maintain state.

**Table: `tracked_posts`**
| Field | Type | Description |
| :--- | :--- | :--- |
| `post_id` | String (PK) | The Unique Patreon Post ID. |
| `last_tier_access` | String | ID of the tier that had access last time we checked. |
| `title` | String | To detect title changes. |

**Table: `bot_config`**
| Key | Value | Description |
| :--- | :--- | :--- |
| `current_admin_id` | String | The Discord ID of the current active admin. |
| `tier_mappings` | JSON | Map of Patreon Tier IDs to Discord Channel IDs. |

---

## 6. Technical Stack & Deployment
* **Language:** Node.js (TypeScript recommended).
* **Library:** `discord.js` (v14).
* **Hosting:** VPS (DigitalOcean/Linode) or Heroku.
* **Secrets:** `.env` file for `PATREON_TOKEN`, `DISCORD_TOKEN`, `WEBHOOK_SECRET`, `ROOT_ADMIN_ID`.

Here is the detailed implementation plan, broken down into phases, formatted in Markdown.

---

# 🚀 Implementation Plan: Patreon Tier-Waterfall Bot

This plan is divided into four main phases, moving from foundational setup and security to core logic and final deployment.

| Phase | Duration Estimate | Primary Focus | Key Deliverables |
| --- | --- | --- | --- |
| **Phase 1** | 1-2 Weeks | Foundation, Security, Admin Panel | Discord Bot running, DB initialized, Admin commands restricted. |
| **Phase 2** | 2-3 Weeks | Webhook Integration & Member Tracking | Real-time member alerts and initial data synchronization. |
| **Phase 3** | 3-4 Weeks | Content Waterfall Logic | Core chapter release logic (`R1`, `R2`) and post state tracking. |
| **Phase 4** | 1 Week | Testing, Debugging & Deployment | Full end-to-end testing, final security check, production launch. |

---

## Phase 1: Foundation, Security, and Setup

The focus is establishing the secure connections and the administrative backbone.

### 1.1 Project Initialization & Core Security (P0)

* **Action:** Create Node.js project, install `discord.js` v14, `axios`, and a database library (e.g., `sqlite3`/`mongoose`).
* **Action:** Set up environment variables (`.env`) for all secrets (`DISCORD_TOKEN`, `PATREON_TOKENS`, `WEBHOOK_SECRET`, and `ROOT_ADMIN_ID`).
* **Action:** Create the database tables: `tracked_posts`, `tier_mappings`, and `bot_config`.
* **Outcome:** Basic bot connects to Discord. Secure configuration ready.

### 1.2 Admin Panel Implementation (P1)

* **Action:** Implement the **User ID Whitelisting** check middleware for all `/admin` commands (R6).
* **Action:** Implement the following Admin Slash Commands (Ephemeral responses):
* `/admin set-owner <user>` (C1)
* `/admin status` (C2 - initial configuration readout)
* `/admin set-channel <tier_name> <channel>` (Links Patreon Tiers to Discord Channels, storing in `tier_mappings` DB table).


* **Outcome:** Restricted admin panel is functional and secure, allowing the creator to map tiers to channels.

### 1.3 Initial Patreon API Connection (P0)

* **Action:** Implement the OAuth 2.0 flow to obtain the initial **Access Token** and **Refresh Token** for the creator. Store securely in the `bot_config` table.
* **Action:** Implement the token refreshing mechanism (crucial for long-term operation).
* **Outcome:** Bot has persistent, authenticated access to the creator's Patreon data.

---

## Phase 2: Webhook Integration & Member Tracking

The focus shifts to receiving real-time data from Patreon and handling member activity.

### 2.1 Webhook Listener & Verification (P0)

* **Action:** Set up the dedicated HTTPS server endpoint to receive all Patreon POST requests.
* **Action:** Implement the **Webhook Signature Verification** logic using the `WEBHOOK_SECRET` to ensure authenticity (PR-I.3).
* **Action:** Register the webhook URL with Patreon for all required events: `members:create`, `members:update`, `posts:publish`, `posts:update`.
* **Outcome:** Bot successfully receives and authenticates Patreon webhooks.

### 2.2 Member Tracking Logic (P0)

* **Action:** Implement webhook handler for `members:create`. Fetch patron name and entitled tier. Send alert to **#welcome** channel (R3).
* **Action:** Implement webhook handler for `members:update`. Fetch the old tier (from DB) and new tier. Implement the upgrade logic (IF new tier rank > old tier rank) and send the upgrade alert (R4).
* **Action:** Implement webhook handler for `members:delete` to log the departure in the **#bot-admin-logs** channel.
* **Action:** Implement the `/admin force-sync` command to manually trigger a full Patreon REST API sweep of all existing members and their tiers for initial population or recovery (C3).
* **Outcome:** Bot provides accurate, real-time tracking of new pledges and tier changes.

## Phase 3: Content Waterfall Logic & State Tracking

This phase implements the core, complex logic required for the tiered content release.

### 3.1 Tier Ranking System (P0)

* **Action:** Create a static, internal tier ranking system (e.g., Diamond=4, Gold=3, Silver=2, Bronze=1, Free=0) for comparison logic in the Waterfall and Upgrade checks.
* **Outcome:** Bot can reliably compare tier levels (e.g., Gold is higher than Silver).

### 3.2 Chapter Upload Alert (R1) (P0)

* **Action:** Implement webhook handler for `posts:publish`.
* **Logic:** Determine the **highest** gated tier (e.g., Diamond). Fetch post metadata (Title, Link, Tags, Collections).
* **Action:** Send the alert to the mapped Discord channel (e.g., #diamond-alerts) using a rich Discord Embed (R5).
* **Action:** **CRITICAL:** Store the `post_id` and the `last_tier_access` (e.g., 'Diamond') in the `tracked_posts` DB table.

### 3.3 Chapter Update Waterfall Logic (R2) (P0)

* **Action:** Implement webhook handler for `posts:update`.
* **Logic:**
1. Fetch the post's **new** highest access tier from the webhook payload (`New Tier`).
2. Fetch the post's **old** highest access tier from the `tracked_posts` DB table (`Old Tier`).
3. Use the Tier Ranking System (3.1) to compare `New Tier` vs. `Old Tier`.
4. **If `New Tier` rank < `Old Tier` rank:** This is a **Waterfall Event** (access expanded). Send a *new* alert to the channel corresponding to the `New Tier`, stating the chapter is now available to them.
5. Update the `last_tier_access` in the `tracked_posts` DB table to the `New Tier`.
6. **If Access did not change:** Ignore or log silently.


* **Outcome:** The bot successfully manages the tiered release schedule, alerting only the tier that has newly gained access.

---

## Phase 4: Testing, Debugging, and Deployment

The final phase ensures quality, reliability, and production readiness.

### 4.1 Unit & Integration Testing (P0)

* **Action:** **Admin Panel Testing:** Test all `/admin` commands using both the authorized ID and an unauthorized ID to confirm security (R6).
* **Action:** **Waterfall Simulation:** Manually trigger webhook payloads to simulate the exact tiered release sequence:
1. Publish Diamond-only \rightarrow Check only Diamond alert.
2. Update to Gold-and-up \rightarrow Check only Gold alert.
3. Update to Silver-and-up \rightarrow Check only Silver alert.


* **Action:** **Member Simulation:** Test the `members:update` webhook for both upgrade and downgrade scenarios to confirm correct alerts.

### 4.2 Error Handling & Logging (P0)

* **Action:** Implement robust `try/catch` blocks around all external API calls (Patreon, DB, Discord) and log errors to the **#bot-admin-logs** channel.
* **Action:** Implement webhook retry logic (if the webhook listener briefly fails, ensure it recovers gracefully).

### 4.3 Production Deployment (P0)

* **Action:** Deploy the final code to the chosen hosting environment (VPS/Heroku).
* **Action:** Finalize the OAuth setup and ensure the public HTTPS webhook URL is active and correctly registered with Patreon.
* **Action:** Run final verification checks using `/admin status` and `/admin force-sync`.
* **Outcome:** The bot is fully operational, secure, and ready for production use.

---

This plan gives you a clear roadmap from development zero to a fully functional and secure Patreon integration. Which phase would you like to start detailing first?