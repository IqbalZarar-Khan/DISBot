# Product Requirements Document (PRD): DISBot Upgrades & New Features

## 1. Introduction & Objective
**DISBot** is currently a robust, feature-rich Patreon-to-Discord automation tool. However, as the user base grows and creators manage larger communities, there is a need to scale the architecture for better efficiency and introduce features that provide a more comprehensive community management experience. 

The objective of this PRD is to outline actionable new features and architectural upgrades to make DISBot more efficient, scalable, and versatile.

## 2. Efficiency & Performance Upgrades

To make the bot more efficient and capable of handling high loads (e.g., a creator with 10,000 patrons dropping a new post), the following backend upgrades are proposed:

### 2.1. Message Queuing System (BullMQ + Redis)
- **Problem**: Currently, if Patreon fires hundreds of webhooks simultaneously, processing them synchronously can lead to memory exhaustion and hitting Discord API rate limits.
- **Solution**: Implement a background job queue using BullMQ. Webhooks are immediately acknowledged (HTTP 200) and placed into a queue. Workers process the queue at a controlled concurrency rate, respecting Discord API limits and ensuring zero dropped events.

### 2.2. Replace Express with Fastify
- **Problem**: Express is stable but relatively slow for high-throughput webhook receiving compared to modern frameworks.
- **Solution**: Migrate the webhook server to Fastify. Fastify handles significantly more requests per second, reducing CPU overhead and improving response times to Patreon's servers.

### 2.3. Redis-Backed Distributed Caching
- **Problem**: The current in-memory DB cache (`dbCache.ts`) works well for single instances but fails if the bot is scaled horizontally (multiple instances).
- **Solution**: Introduce Redis as a centralized caching layer. This allows for horizontal scaling and ensures that all instances share the same state and rate-limit counters.

### 2.4. Batch Processing for Database Writes
- **Problem**: High volumes of member updates can lead to excessive individual database queries.
- **Solution**: Implement batch insertions and updates for Supabase. Instead of inserting member tracking logs one by one, queue them and write in batches every 5-10 seconds.

## 3. Proposed New Features

### 3.1. Automated Discord Role Synchronization
- **Description**: Beyond sending alerts to specific channels, DISBot should actively manage Discord Roles. If a user pledges to the "Gold" tier, DISBot automatically grants them the Gold Discord role, and removes it when they downgrade/leave.
- **Value**: Completely replaces the need for the official Patreon bot, making DISBot an all-in-one solution.


### 3.2. Web-Based Analytics Dashboard
- **Description**: While `/admin stats` is great, a visual dashboard is better. Serve a lightweight web dashboard (accessible via a secure link generated in Discord) that shows graphs of patron retention, churn rate, and popular tiers using Chart.js.
- **Value**: Provides creators with deep insights into their community health without leaving the DISBot ecosystem.


### 3.3. User-Selectable Content Filters (Tags)
- **Description**: Allow Discord members to use dropdown menus to opt-out of certain notifications (e.g., "Only ping me for text chapters, not fanart").
- **Value**: Reduces notification fatigue and prevents users from muting the entire server.

## 4. Implementation Timeline (Proposed)

- **Phase 1: Foundation (Efficiency)**: Implement BullMQ, Redis, and Fastify. Transition from in-memory to distributed caching.
- **Phase 2: Core Expansion**: Build the Automated Discord Role Synchronization.
- **Phase 3: Value-Adds**: Develop the web analytics dashboard.
