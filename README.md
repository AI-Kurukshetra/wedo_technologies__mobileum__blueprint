# TeleGuard Pro

**AI-powered telecom fraud detection and revenue assurance platform**

TeleGuard Pro helps telecom operators detect fraud early, reduce revenue leakage, and streamline investigations through configurable rules, alerts, case management, and analytics—all with organization-scoped multi-tenancy and role-based access.

---

## Features

| Area | Capabilities |
|------|--------------|
| **CDR analytics** | CSV/API ingestion, normalization, aggregation, and KPI reporting |
| **Fraud detection** | Configurable rules engine (thresholds, time windows, allow/deny lists, geo/time heuristics) |
| **Alerts** | Alert generation, routing, severity levels, and SLA tracking |
| **Case management** | Triage, assignments, evidence linkage, notes, outcomes, and audit trail |
| **Analytics** | Revenue leakage, roaming, interconnect, fraud patterns, reconciliation |
| **Security** | Supabase Auth, org-based multi-tenancy, RBAC |

---

## Tech stack

- **Framework:** [Next.js](https://nextjs.org/) 15
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL, RLS, Auth)
- **UI:** React 19, [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Recharts](https://recharts.org/)
- **Deployment:** Vercel-ready

---

## Prerequisites

- **Node.js** 18+
- **npm** or **pnpm**
- **Supabase** project ([supabase.com](https://supabase.com))

---

## Getting started

### 1. Clone and install

```bash
git clone <repository-url>
cd teleguard-pro
npm install
```

### 2. Environment variables

Create a `.env.local` (or copy from `.env.example` if present) with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database

Apply Supabase migrations and (optionally) seed data:

- Run migrations via Supabase CLI or dashboard.
- Seed demo data: `npm run seed` or `npm run seed:realistic`.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed database (demo data) |
| `npm run seed:realistic` | Seed with realistic demo data |
| `npm run jobs` | Run scheduled jobs (e.g. rule evaluation) |

---

## Documentation

Detailed product and technical docs live in **`/docs`**:

- **[docs/README.md](docs/README.md)** — Documentation index and build order
- **[docs/TELEGUARD_PRO_FLOW.md](docs/TELEGUARD_PRO_FLOW.md)** — End-to-end data flow (CDR → rules → alerts → cases → analytics)
- **PRD, architecture, schema, API, UI, deployment** — See the document map in `docs/README.md`

---

## License

Proprietary. All rights reserved.
