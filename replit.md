# A New America: Elo Vote

## Overview
A full-stack web application where users vote between two candidate aliases for the United States. Rankings use ELO with separate leaderboards for American and Non-American voters. The app features self-hosted captcha anti-spam, transparent formulas, and privacy-preserving design.

## Recent Changes
- 2026-02-13: Security hardening — captcha plan single-use enforcement (consumedAt), rate limits on matchup/captcha-start endpoints, captcha required for account deletion, session bloat fix
- 2026-02-13: Integrated Clerk authentication (replaces captcha-based pre-auth)
- 2026-02-13: Initial MVP built with all core features

## Architecture
- **Frontend**: React + Wouter + TanStack Query + Tailwind + Shadcn UI + Clerk
- **Backend**: Express.js with session-based auth (PostgreSQL-backed sessions), Clerk JWT verification via JWKS
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Clerk (frontend sign-in/sign-up UI) synced to backend sessions via JWT-verified /api/auth/clerk-sync endpoint
- **Captcha**: Self-hosted with 4 engines (PoW A, PoW B, SVG text, Math) - used for account activation (4 challenges), vote, and submit anti-spam

## Project Structure
```
client/src/
  pages/         - Vote, Leaderboard, Submit, About
  components/    - Header, CaptchaChallenge, ThemeProvider, UI components
  hooks/         - useAuth, useToast, useMobile
server/
  routes.ts      - All API routes
  storage.ts     - Database storage layer
  db.ts          - Database connection
  lib/
    elo.ts       - ELO calculation
    captcha/     - Captcha engines and plan management
    abusePolicy.ts - Rate limiting and abuse prevention
shared/
  schema.ts      - Drizzle schema definitions
```

## Key Features
- Dual ELO leaderboards (American vs Non-American)
- Self-hosted captcha system with tunable difficulty
- Captcha debt/difficulty system with decay
- Rate limiting (120 votes/hour, 2 submissions/day)
- Account age requirements for submissions (24h)
- Transparency page with all formulas exposed
- Connected user counters

## User Preferences
- No external captcha services (no Google/Cloudflare)
- Privacy-first: no IP storage, no location prompts
- Full transparency on anti-spam systems
