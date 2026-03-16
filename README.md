# Telegram Interactive Gantt & PM Bot

A lightweight project management Telegram bot with an interactive Gantt chart visualization built as a Telegram Mini App. Users create projects via guided prompts or JSON upload in private chat, publish them to group chats, and interact with the Gantt chart directly inside Telegram.

## Prerequisites

Before setup, ensure the following are installed:

- **Node.js 24.x LTS** or later — check with `node -v`
- **npm** — comes with Node.js
- **Docker** and **Docker Compose** — for the local PostgreSQL database
- **A Telegram bot token** — create one via [@BotFather](https://t.me/BotFather) on Telegram

## Project Structure

```
telegram-gantt-bot/
├── src/                          # Backend (TypeScript, Node.js)
│   ├── app.ts                    # Composition root — wires everything
│   ├── config/                   # Environment validation, DB client
│   ├── gateways/                 # I/O boundary (no business logic)
│   │   ├── bot/                  # Telegram bot commands & conversations
│   │   │   ├── bot.gateway.ts
│   │   │   ├── conversations/    # grammY guided flows
│   │   │   └── types.ts          # Custom BotContext type
│   │   ├── webapp/               # REST API for the Mini App
│   │   └── shared/               # grammy adapter implementation
│   ├── modules/                  # Domain logic (owns entities)
│   │   ├── project-lifecycle/    # Project & Member CRUD
│   │   ├── task-management/      # Task CRUD, status transitions
│   │   ├── publishing/           # Group chat summary messages
│   │   └── notification/         # Status change notifications
│   └── shared/                   # Cross-module types & interfaces
├── webapp/                       # Frontend Mini App (React, Vite)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/           # GanttChart, TaskDetailSheet, etc.
│   │   ├── hooks/                # useProject (data lifecycle)
│   │   ├── lib/                  # API client, date utils, TG SDK
│   │   └── types/                # Shared frontend types
│   ├── index.html
│   └── vite.config.ts
├── prisma/
│   └── schema.prisma             # Database schema
├── tests/
│   └── fitness/                  # Architectural fitness function tests
├── docker-compose.yml            # Local PostgreSQL 17
├── Dockerfile                    # Production single-container build
├── package.json
├── tsconfig.json
├── prisma.config.ts
├── eslint.config.js
└── vitest.config.ts
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local PostgreSQL database

```bash
docker compose up -d
```

This starts a PostgreSQL 17 container on port 5432 with:

- User: `gantt`
- Password: `gantt_dev_password`
- Database: `gantt_bot`

Wait a few seconds for the container to become healthy. Verify with:

```bash
docker compose ps
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set the following values:

```env
BOT_TOKEN=<paste your token from @BotFather>
WEBAPP_URL=https://your-domain.com
DATABASE_URL=postgresql://gantt:gantt_dev_password@localhost:5432/gantt_bot
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
```

For `WEBAPP_URL` during local development, you need a publicly accessible HTTPS URL that tunnels to your local Vite dev server on port 5173. This is because Telegram Mini Apps require a secure HTTPS connection. We recommend using [ngrok](https://ngrok.com/):

#### Detailed ngrok Setup Guide

1. **Create an account & Download**: Go to [ngrok.com](https://ngrok.com/), sign up for a free account, and download the ngrok executable for your OS (or install via a package manager like `choco install ngrok` on Windows, or `brew install ngrok/ngrok/ngrok` on macOS).
2. **Authenticate**: Once installed, you need to add your auth token. Find your authtoken in the "Your Authtoken" section of the ngrok dashboard and run:
   ```bash
   ngrok config add-authtoken <your-auth-token>
   ```
3. **Start the tunnel**: Leave your Vite frontend server running on port 5173, and in a **new terminal window**, run:
   ```bash
   ngrok http 5173
   ```
4. **Copy the URL**: ngrok will display a terminal UI. Look for the `Forwarding` line that starts with `https://` (e.g., `https://abc123xyz.ngrok-free.app`). 
5. **Update `.env`**: Copy this HTTPS URL and set it as your `WEBAPP_URL` in the `.env` file.

*(Alternative tunneling tools: [localtunnel](https://github.com/localtunnel/localtunnel) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/).)*

### 4. Generate Prisma client and run database migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

The first command generates the TypeScript Prisma client. The second creates the database tables from `prisma/schema.prisma` and applies the migration.

### 5. Start the development servers

You need two terminals:

**Terminal 1 — Backend (bot + API):**

```bash
npm run dev
```

This starts the Fastify server on port 3000 with hot reload via `tsx watch`. The bot uses long polling in development mode (no webhook required).

**Terminal 2 — Frontend (Mini App):**

```bash
cd webapp
npx vite
```

This starts the Vite dev server on port 5173. API requests to `/api/*` are proxied to the backend on port 3000 (configured in `webapp/vite.config.ts`).

### 6. Verify the bot is running

Open Telegram, find your bot (the one you created with @BotFather), and send `/start`. You should see the help message.

## Available Scripts

| Command                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `npm run dev`               | Start backend with hot reload (tsx watch)         |
| `npm run build`             | Compile TypeScript backend + build React frontend |
| `npm run start`             | Run the compiled production build                 |
| `npm run db:generate`       | Regenerate Prisma client after schema changes     |
| `npm run db:migrate:dev`    | Create and apply a new migration                  |
| `npm run db:migrate:deploy` | Apply pending migrations (production)             |
| `npm run db:studio`         | Open Prisma Studio (database GUI)                 |
| `npm test`                  | Run all tests                                     |
| `npm run test:fitness`      | Run architectural fitness function tests only     |
| `npm run lint`              | Lint source and test files                        |
| `npm run lint:boundaries`   | Lint module boundary rules (FF-1, FF-5)           |
| `npm run typecheck`         | Type-check without emitting files                 |

## Common Development Tasks

### Modifying the database schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe-your-change`
3. Prisma auto-regenerates the client

### Resetting the database

```bash
npx prisma migrate reset
```

This drops all data, re-runs all migrations, and re-generates the client.

### Viewing the database

```bash
npm run db:studio
```

Opens Prisma Studio in your browser at `http://localhost:5555`.

### Running only the fitness tests

```bash
npm run test:fitness
```

These verify architectural boundaries are not violated: module dependency direction (FF-1), no cross-module direct data access (FF-2), task status state machine correctness (FF-3), and no direct Telegram SDK usage in domain modules (FF-5).

## Tech Stack

| Layer         | Technology           | Version    |
| ------------- | -------------------- | ---------- |
| Runtime       | Node.js              | 24.x LTS   |
| Language      | TypeScript           | 5.7+       |
| Bot Framework | grammY               | 1.41+      |
| HTTP Server   | Fastify              | 5.8+       |
| ORM           | Prisma               | 7.2+       |
| Database      | PostgreSQL           | 17.x       |
| Frontend      | React + Vite         | 19.x / 6.x |
| Testing       | Vitest               | 3.x        |
| Linting       | ESLint (flat config) | 9.x        |

## Production Deployment

The project includes a multi-stage Dockerfile that builds both the backend and frontend into a single container:

```bash
docker build -t gantt-bot .
docker run -d \
  -e BOT_TOKEN=your-token \
  -e WEBAPP_URL=https://your-domain.com \
  -e DATABASE_URL=postgresql://user:pass@db-host:5432/gantt_bot \
  -e WEBHOOK_URL=https://your-domain.com \
  -e WEBHOOK_SECRET=your-random-secret-min-16-chars \
  -e NODE_ENV=production \
  -p 3000:3000 \
  gantt-bot
```

In production, the bot uses webhooks instead of long polling. Set `WEBHOOK_URL` to your server's public HTTPS URL and `WEBHOOK_SECRET` to a random string (minimum 16 characters). The backend automatically calls `setWebhook` on startup.

## Environment Variables Reference

| Variable         | Required | Default       | Description                                                   |
| ---------------- | -------- | ------------- | ------------------------------------------------------------- |
| `BOT_TOKEN`      | Yes      | —             | Telegram bot token from @BotFather                            |
| `WEBAPP_URL`     | Yes      | —             | Public HTTPS URL where the Mini App is accessible             |
| `DATABASE_URL`   | Yes      | —             | PostgreSQL connection string                                  |
| `PORT`           | No       | `3000`        | HTTP server port                                              |
| `HOST`           | No       | `0.0.0.0`     | HTTP server bind address                                      |
| `NODE_ENV`       | No       | `development` | `development`, `production`, or `test`                        |
| `WEBHOOK_URL`    | No       | —             | Public HTTPS URL for Telegram webhooks (production only)      |
| `WEBHOOK_SECRET` | No       | —             | Webhook secret token, minimum 16 characters (production only) |
