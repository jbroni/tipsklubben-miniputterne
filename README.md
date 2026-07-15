# ⚽ Tips 13 — Football Prediction Club

A web app for a small friend group to play a weekly football prediction game based on the Danish "Tips 13 lørdag" coupon.

## Features

- **Weekly rounds** — 13 matches per round, predict Home (1), Draw (X), or Away (2)
- **Fedt scoring** — measures how bold or safe your picks are (0 = bold, 100 = safe)
- **Leaderboard** — season standings with Fedt tiebreaker
- **Personal stats** — track your performance, best/worst rounds, Fedt trends
- **Admin panel** — create seasons, manage rounds, enter matches & results
- **Google login** — simple auth with Google OAuth
- **Mobile-first** — responsive design for submitting picks on your phone

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL + Auth)
- **Prisma** ORM
- **Tailwind CSS**
- **Vercel** hosting

---

## Setup Guide

### 1. Prerequisites

- Node.js 18+ installed
- A [Supabase](https://supabase.com) account (free tier)
- A [football-data.org](https://www.football-data.org/) API key (free tier)
- A [Vercel](https://vercel.com) account (free tier)

### 2. Supabase Setup

1. Create a new Supabase project at https://app.supabase.com
2. Go to **Settings → API Keys** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `publishable` key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `secret` key → `SUPABASE_SECRET_KEY`
3. Go to **Settings → Database** and copy the connection string → `DATABASE_URL`
   - Use the "URI" format with your password
   - Also copy the "Direct connection" string → `DIRECT_URL`

### 3. Google OAuth Setup

1. In Supabase, go to **Authentication → Providers → Google**
2. Enable Google provider
3. Follow the instructions to set up Google OAuth:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Set authorized redirect URI to: `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
4. Enter the Google Client ID and Secret in Supabase

### 4. Local Development

```bash
# Clone the repo
git clone <your-repo-url>
cd tips13

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Fill in your .env file with the values from steps 2-3

# Push the database schema
npx prisma db push

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev
```

Visit http://localhost:3000

### 5. First Login & Admin Setup

1. Sign in with Google
2. Open Prisma Studio to make yourself an admin:
   ```bash
   npx prisma studio
   ```
3. Find your user in the `users` table and change `role` to `admin`
4. Refresh the app — you'll now see the Admin Panel

### 6. Deploy to Vercel

1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. Go to [Vercel](https://vercel.com/new) and import the GitHub repo

3. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `FOOTBALL_DATA_API_KEY`

4. Deploy!

---

## Usage

### Weekly Workflow

1. **Admin creates a round** — set deadline, add 13 matches with odds
2. **Members submit predictions** — pick 1, X, or 2 for each match
3. **Deadline passes** — round locks, predictions are revealed
4. **Results entered** — manually or auto-resolved from football-data.org
5. **Scores calculated** — leaderboard and Fedt stats update

### Fedt Score

The Fedt score measures how conservative (safe) or risky (bold) your picks are:

- **100** = all safest picks (heavy favorites)
- **0** = all boldest picks (underdogs)
- When two players are tied on points, the **lower Fedt score** (bolder) wins

### Football Data API

The free tier of football-data.org covers:
- Premier League
- Bundesliga
- Serie A
- La Liga

Danish Superliga matches need to be entered manually.

---

## Project Structure

```
tips13/
├── prisma/schema.prisma      # Database schema
├── src/
│   ├── app/                   # Next.js pages & API routes
│   │   ├── page.tsx           # Dashboard
│   │   ├── rounds/            # Round pages
│   │   ├── leaderboard/       # Leaderboard
│   │   ├── fedt/              # Fedt stats
│   │   ├── profile/           # User profile
│   │   ├── admin/             # Admin panel
│   │   └── api/               # Backend API routes
│   ├── components/            # Reusable UI components
│   ├── lib/                   # Utilities & clients
│   │   ├── fedt.ts            # Fedt calculation
│   │   ├── auth.ts            # Auth helpers
│   │   ├── prisma.ts          # Database client
│   │   ├── football-api.ts    # External API client
│   │   └── supabase-*.ts      # Supabase clients
│   └── types/                 # TypeScript types
└── tailwind.config.ts
```

---

## License

Private project — not for redistribution.
