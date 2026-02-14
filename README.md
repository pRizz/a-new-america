# A New America: Elo Vote

A full-stack web app for ranking candidate names for the United States with transparent ELO leaderboards and anti-spam protections.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [Quickstart (Local)](#quickstart-local)
5. [Environment Variables](#environment-variables)
6. [Scripts and Commands](#scripts-and-commands)
7. [Project Structure](#project-structure)
8. [API Reference](#api-reference)
9. [Data Model](#data-model)
10. [How Voting and Ranking Works](#how-voting-and-ranking-works)
11. [Anti-Abuse and CAPTCHA System](#anti-abuse-and-captcha-system)
12. [Deployment](#deployment)
13. [Troubleshooting](#troubleshooting)
14. [Security and Privacy Notes](#security-and-privacy-notes)
15. [Contributing](#contributing)
16. [License](#license)

## Overview

Users sign in with Clerk and participate in pairwise voting between two proposed names. The app supports secure account activation and anti-spam workflows before actions that can affect ranking integrity.

Flow:

1. User signs in with Clerk.
2. A user must be activated before they can vote.
3. For voting and submissions, the app issues a CAPTCHA plan with multiple challenge steps.
4. The user submits a matchup vote or a new name only after required CAPTCHA steps complete.
5. ELO ratings update for the challenged pair.
6. Ratings are tracked separately for American and non-American voters.

Ranking is driven by a per-name `eloAmerican` and `eloNonAmerican`, plus separate vote counters.

## Tech Stack

- Frontend: React 18, Vite 7, Wouter, TanStack Query, Tailwind CSS, shadcn/ui components, Clerk React
- Backend: Express 5, TypeScript, `express-session`, PostgreSQL-backed sessions
- Data layer: Drizzle ORM + PostgreSQL with schema in `shared/schema.ts`
- Security: custom self-hosted CAPTCHA engines and HTTP session cookies
- Build tooling: `tsx`, `esbuild`, `vite`

## Features

- Public homepage with live matchups and scoreboard context
- Clerk authentication + backend user sync (`/api/auth/clerk-sync`)
- Dual ELO rails (`eloAmerican` and `eloNonAmerican`)
- Account activation required before voting
- Anti-spam CAPTCHA for registration, voting, name submission, and account deletion
- Admin-style transparency page describing formulas and guardrails
- Real-time-ish stats (`/api/stats`) and user-specific CAPTCHA guidance

## Quickstart (Local)

### Prerequisites

- Node.js 20+
- PostgreSQL instance + `DATABASE_URL`
- Clerk account and publishable key
- `npm` or equivalent package manager

### Setup Steps

1. Install dependencies

```bash
npm install
```

2. Create `.env` with required values (example below)

3. Push database schema

```bash
npm run db:push
```

4. Start development server

```bash
npm run dev
```

The app runs as a single server process serving both API and frontend.

- It binds to `0.0.0.0`
- It uses `PORT` env (defaults to `5000`)
- On first DB use, seed data is inserted when no names exist

### `.env` template

```env
DATABASE_URL=postgres://user:password@host:5432/dbname
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
SESSION_SECRET=replace-with-long-random-string
PORT=5000
```

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string for Drizzle and sessions |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key exposed to Vite frontend and used by backend JWKS flow |
| `SESSION_SECRET` | Yes | Secret used by `express-session`; required at startup |
| `PORT` | No | Port for server listen, default `5000` |
| `NODE_ENV` | No | Runtime mode selector (`development` vs `production`) |

## Scripts and Commands

```json
{
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "tsx script/build.ts",
  "start": "NODE_ENV=production node dist/index.cjs",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

- `npm run dev` starts Express + Vite middleware in development mode.
- `npm run build` builds the client (`vite`) then bundles the server (`esbuild`) into `dist/index.cjs`.
- `npm run start` serves static production build from `dist/public` in a single process.
- `npm run check` runs TypeScript checking.
- `npm run db:push` syncs schema migrations via Drizzle.

## Project Structure

- `client/` React UI entry and pages
- `client/src/main.tsx` Clerk provider bootstrap and app mount
- `client/src/App.tsx` Routing and auth gating
- `client/src/pages/` `vote`, `leaderboard`, `submit`, `account`, `about`, `not-found`
- `client/src/components/` UI primitives and application components
- `client/src/hooks/` `use-auth` and utilities
- `server/` API routes, session setup, storage, captcha and abuse logic
- `server/index.ts` app startup and global middleware
- `server/routes.ts` API route handlers
- `server/storage.ts` Drizzle-backed data access layer
- `server/db.ts` PostgreSQL connection
- `server/lib/elo.ts` ELO delta computation
- `server/lib/captcha/*` CAPTCHA engine and plan/sequence logic
- `server/lib/abusePolicy.ts` rate limits and validation checks
- `shared/schema.ts` database schema + shared TS types
- `script/build.ts` production build orchestration
- `drizzle.config.ts` Drizzle migration config
- `vite.config.ts` client build and middleware config

## API Reference

All API routes are prefixed with `/api`.

### Authentication and account routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auth/me` | Optional | Returns current app user from session or 401 |
| `POST` | `/api/auth/clerk-sync` | Requires Clerk JWT in `Authorization: Bearer <token>` | Validates Clerk token, creates/updates user, stores session user |
| `POST` | `/api/auth/activate` | Required | Completes account activation using captcha plan; body: `{ captchaPlanId }` |
| `POST` | `/api/auth/logout` | Required | Clears session |
| `DELETE` | `/api/auth/account` | Required | Deletes user after matching completed `delete` captcha plan. Body: `{ captchaPlanId }` |

### Core data and game routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/stats` | Public | Global counters: `totalVotes`, `connectedAmericans`, `connectedNonAmericans` |
| `POST` | `/api/ping` | Public | Updates user `lastSeenAt` when signed in |
| `GET` | `/api/names` | Public | Returns list of active names |
| `GET` | `/api/vote/matchup` | Public | Returns one random active pair: `nameA`, `nameB`, `voteAttemptId` |
| `POST` | `/api/vote` | Required | Body: `{ winnerId, loserId, voteAttemptId, captchaPlanId }` |

### CAPTCHA and anti-abuse routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/captcha/start` | Partially required | Starts a plan for `preauth`, `registration`, `vote`, `submit`, `delete` |
| `POST` | `/api/captcha/regenerate` | Public | Regenerates text/math challenge for a challenge in an active plan |
| `POST` | `/api/captcha/solve` | Public | Submits challenge answer; advances plan or completes it |

### User context and submission routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/user/captcha-info` | Required | Returns current anti-spam metrics and current vote requirements |
| `GET` | `/api/user/submit-info` | Required | Returns current name submission requirements and account-age gate |
| `GET` | `/api/user/profile` | Required | Returns `{ id, displayName, isValidAccount, createdAt, detectedCountry }` |
| `POST` | `/api/names/submit` | Required | Body: `{ text, captchaPlanId }`; validates text and anti-spam rules |

### Common behavior

- Auth-protected routes return `401` when session is missing.
- CAPTCHA-required mutations return `400` or `429` with message context and may include lockout metadata from solve/regenerate endpoints.
- Every action is logged with structured JSON in middleware for `/api` routes.

## Data Model

The schema is defined in `shared/schema.ts`.

### `users`

- `id` string primary key
- `displayName`, `oauthProvider`, `oauthId`
- `isValidAccount` boolean
- `isAmerican` boolean
- `inferredCountryCode`, `inferredUsState`
- `captchaDifficulty`, `captchaDebt`
- `lastCaptchaDecayAt`, `lastSeenAt`, `createdAt`

### `names`

- `id`, `text`, `normalizedText` (unique)
- `eloAmerican`, `eloNonAmerican`
- `voteCountTotal`, `voteCountAmerican`, `voteCountNonAmerican`
- `isActive`
- `submittedBy`, `createdAt`, `lastVotedAt`

### `votes`

- `id`, `userId`, `winnerId`, `loserId`
- `voteAttemptId` (unique together with `userId`)
- `isAmerican`, `eloDelta`, `createdAt`

### `captcha_plans`

- `id`, `userId`
- `planType` (`preauth`, `registration`, `vote`, `submit`, `delete`)
- `requiredCount`, `completedCount`, `difficulty`
- `isCompleted`, `consumedAt`, `expiresAt`, `createdAt`

### `captcha_challenges`

- `id`, `planId`
- `engineType` (`pow_a`, `pow_b`, `svg_text`, `math`)
- `stepIndex`
- `challengeData` JSON string
- `hashedAnswer`
- `isSolved`, `createdAt`

### `global_config`

- `id` singleton key
- `totalVotes`, `totalSubmissions`
- `globalMinCaptchaForSubmitName`, `globalMinCaptchaCountForSubmitName`
- `connectedAmericans`, `connectedNonAmericans`
- `lastConnectedRecomputeAt`

### `rate_limit_buckets`

- `id`, `userId`, `bucketType`
- `count`
- `windowStart`, `windowEnd`

### `abuse_events`

- `id`, `userId`
- `eventType`, `outcome`, `reasonCode`
- `metadata`, `createdAt`

### Shared runtime types

The shared file exports Drizzle inferred types:

- `User`
- `Name`
- `Vote`
- `InsertUser`
- `InsertName`
- `InsertVote`
- `CaptchaPlan`
- `CaptchaChallenge`
- `GlobalConfig`

Validation schema:

- `submitNameSchema`: `text` length 3–60 and must contain at least one letter.
- CAPTCHA plan payloads are created server-side from `planType` and dynamic rules.

## How Voting and Ranking Works

Each name starts with ELO `1000` for both leaderboards.

When a vote is posted:

- Winner uses the voter's active leaderboard (`eloAmerican` or `eloNonAmerican`).
- Loser uses the same leaderboard.
- K-factor is `32`.
- Update formula:
  - `expected = 1 / (1 + 10^((loser - winner) / 400))`
  - `delta = K * (1 - expected)`
  - `winnerNew = winner + delta`
  - `loserNew = loser - delta`

The app tracks matchups from active names and updates total and segment-specific counts at submission time.

Seed behavior:

- On first DB bootstrap, if no names exist, a starter set of example names is inserted.

## Anti-Abuse and CAPTCHA System

### Plan types

- `preauth`: required before sign-up flow continuation in vote gating
- `registration`: account activation (4 steps)
- `vote`: protects voting operations
- `submit`: protects name submission
- `delete`: protects account deletion

### Engine types

- `pow_a` and `pow_b`: proof-of-work challenges
- `svg_text`: distorted SVG text challenge
- `math`: SVG-based arithmetic expression challenge

### Requirements and behavior

- Plan start uses account state and plan type to compute:
  - required challenge count
  - difficulty
- Each solved challenge advances the plan by one step.
- On completion:
  - vote/submit/delete plans are marked consumed.
  - one-time use is enforced.

### Rate limits and lockouts

- Captcha starts: 20 starts per 5 minutes per session, 5-minute lockout
- Matchup endpoint: 60 requests/minute per session, 60-second lockout
- Captcha regeneration: 10 requests/5 minutes per session, 5-minute lockout
- Solve failures: max 5 wrong attempts/5 minutes, 5-minute lockout
- Vote attempts: max 120 per user per hour
- Submissions: max 2 per user per day
- Submit action additionally requires account age >= 24h
- Plans expire after 10 minutes, cleanup job prunes stale plan/challenge data

### CAPTCHA scaling

- Vote requirement:
  - `voteRequiredCount = max(4, 4 + floor(captchaDebt / 30))`
  - `voteDifficulty = clamp(captchaDifficulty + floor(captchaDebt / 25), 0, 100)`
- Submit requirement:
  - `submitRequiredCount = max(globalMinCount, 15 + floor(captchaDebt / 20))`
  - `submitDifficulty = max(globalMinDifficulty, clamp(captchaDifficulty + floor(captchaDebt / 15), 0, 100))`
- Global submission minimum difficulty starts at 85 and increases by 2 per successful submission (cap 95).
- Global minimum required count starts at 15 and increases by 1 every 25 successful submissions (cap 25).
- Decay (applied lazily): every 3 days of inactivity
  - `captchaDebt -= 15` (floor 0)
  - `captchaDifficulty -= 2` (floor 60)
- Successful vote increments debt by 10 and increases difficulty by 1 (max 95).

## Known Behavior Caveat

The current server flow creates users with `isAmerican = false` by default and does not visibly update this flag during Clerk sign-in sync or profile fetch. Geo lookups are used for profile display and connected-user counting, but geographic voting segmenting is not fully materialized as a persisted per-user classification in the present route flow.

If you depend on strict geographic separation for vote routing, verify and implement persistence of `isAmerican` before relying on production assumptions.

## Deployment

### Production flow

1. Set production env vars.
2. `npm install`
3. `npm run db:push`
4. `npm run build`
5. `npm run start`

Notes:

- Production server serves static frontend from `dist/public`.
- The server still exposes all API routes under `/api`.
- The app is designed for one public listener port (`PORT`), making reverse proxy and platform routing straightforward.

### Typical hosting patterns

- Single-ported Node hosting with environment variables
- Any platform supporting Node process execution and PostgreSQL network access

## Troubleshooting

- Frontend startup throws `Missing VITE_CLERK_PUBLISHABLE_KEY environment variable` if key is absent.
- Missing `DATABASE_URL` fails database initialization and migration config checks.
- If DB schema is missing, rerun `npm run db:push`.
- If captchas do not behave as expected, try reloading and clearing session cookies.
- If seed names are missing after setup, confirm `storage.seed()` is reachable at startup and `names` table is empty.

## Security and Privacy Notes

- Anti-spam is self-hosted, no Google/Cloudflare captcha dependency.
- No explicit browser geolocation prompt is requested.
- Only coarse location signals are used (`inferredCountryCode` / `detectedCountry` path when available).
- Session secret should be strong in production to prevent session tampering.
- Cookies are `httpOnly`, and marked `secure` in production.

## Contributing

- Use strict TypeScript (`npm run check`) and keep shared API/data types updated.
- Update `shared/schema.ts` first for schema changes, then adjust storage and API handlers.
- Keep route contracts and frontend query/mutation shapes in sync.
- Follow existing route conventions (e.g. `404` handling via `client/src/pages/not-found.tsx`).

Validation scenarios:

1. Clean clone, set env, run `npm run db:push`, run `npm run dev`, open the homepage.
2. Run `GET /api/stats` from browser or curl and confirm 200 response.
3. Trigger unauthenticated voting flow and verify pre-auth captcha gate appears.
4. Sign in, complete required activation and vote flow; confirm `/api/stats` total increases after successful vote.
5. Submit a new name using authenticated flow and required captcha steps; confirm new name appears on leaderboard.
6. Run `npm run build` then `npm run start`; verify app boots and serves pages in production mode.

## License

MIT
