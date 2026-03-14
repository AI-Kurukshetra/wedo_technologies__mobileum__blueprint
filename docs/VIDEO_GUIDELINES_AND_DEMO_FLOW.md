# TeleGuard Pro — Video Guidelines & Screen Navigation Flow

**Hackathon:** AI Mahakurukshetra | March 14, 2026  
**Max duration:** 5 minutes  
**Tools:** Loom, OBS, or any screen recorder → upload to **Google Drive** (sharing: *Anyone with the link can view*).

---

## 1. Video structure (5 minutes)

| Section        | Time        | What to cover |
|----------------|-------------|----------------|
| **Hook**       | 0:00 – 0:30 | What problem does TeleGuard Pro solve? Who is it for? |
| **Product Demo** | 0:30 – 2:30 | Live app — key user flows, main features, seed data |
| **Tech Stack** | 2:30 – 3:30 | Next.js + Supabase + Vercel + AI CLI used (Claude/Codex) |
| **Why Better** | 3:30 – 4:30 | How it's different from existing fraud/RA tools |
| **CTA**        | 4:30 – 5:00 | One of the Bacancy CTAs (see below) |

---

## 2. Full speech script

Read or paraphrase; keep to the timings so you stay under 5 minutes.

### Hook (0:00 – 0:30)

> "Hi, I'm [your name]. Telecom operators lose millions to fraud and revenue leakage because CDR data is huge, tools are scattered, and investigations are slow.
>
> TeleGuard Pro solves this. It's an AI-powered fraud detection and revenue assurance platform for operators and MVNOs. One place for CDR analytics, rules, alerts, and case management. Let me show you."

---

### Product demo — speech per screen

**Login (0:30 – 0:45)**  
> "I'll sign in with Supabase Auth."  
*[Enter credentials, submit.]*  
> "And we're in."

**Dashboard (0:45 – 1:10)**  
> "The dashboard is the nerve center. Here you see KPIs — calls, duration, revenue — and alert and case summaries. These charts and top destinations are driven by our seed data. Analysts get the big picture in one view."

**Alerts list (1:10 – 1:30)**  
> "Under Alerts we have everything the rules engine has flagged. I can filter by severity and status."  
*[Click one alert.]*

**Alert detail (1:30 – 1:45)**  
> "Each alert shows why it fired — explainability — and I can acknowledge it or open a case for investigation."

**Cases list (1:45 – 2:00)**  
> "Cases are where we track investigations."  
*[Click one case.]*

**Case detail (2:00 – 2:15)**  
> "Here we have notes, evidence, and status. Full audit trail for compliance."

**Rules (2:15 – 2:30)**  
> "Rules are configurable — thresholds, time windows, allow and deny lists. I can create or edit a rule; the engine evaluates and generates alerts."

**CDR (2:30 – 2:45)**  
> "CDR imports and explorer: we upload CSV, normalize, and then slice by time, destination, or carrier. This is the data that feeds the rules and dashboard."

**Reports / Analytics (2:45 – 3:00)**  
> "Reporting and analytics — fraud patterns, revenue leakage views — give managers and RA teams the insights they need. All in one platform."

---

### Tech stack (2:30 – 3:30)

> "On the tech side: Next.js with App Router for the front end and API, Supabase for auth and Postgres with row-level security, and Vercel for deployment. The whole app was built with [Claude CLI / Codex CLI] — AI-assisted development from the ground up."

---

### Why better (3:30 – 4:30)

> "How is TeleGuard Pro different? First, it's one product: ingestion, rules, alerts, cases, and reporting instead of five different tools. Second, alerts are explainable — you see exactly which condition fired. Third, case management ties evidence and notes to each investigation. And it's multi-tenant and built to scale. That's TeleGuard Pro."

---

### CTA (4:30 – 5:00) — pick one

**Option A**  
> "Build fast. Scale smart. Stay secure. Connect with Bacancy and launch your application the right way."

**Option B**  
> "Speed matters. Quality matters. Scale matters. If you want your application built quickly with enterprise-grade security and performance — Bacancy is your technology partner. Connect with us today."

**Option C**  
> "Have an idea? Let's turn it into a powerful, scalable, and secure product — fast. Bacancy combines AI, cloud, and modern engineering to help you launch and scale without limits. Thanks for watching."

---

## 3. UI flow (step-by-step)

Do these actions in order while saying the speech above. One continuous flow, no long pauses.

| Step | Screen / Route | UI action | What appears / what to point at |
|------|----------------|-----------|----------------------------------|
| **1** | Login `/login` | Enter seed user email → password → click **Sign in** | Login form; then redirect to app (dashboard or home). |
| **2** | Dashboard `/dashboard` | Land on dashboard. Scroll if needed. | Point at: KPI cards (Calls, Duration, Revenue, etc.), alert summary counts, case summary, time-series chart, top destinations. |
| **3** | Sidebar → Alerts | Click **Alerts** in left nav. | Alerts list with table; filters (severity, status) if visible. |
| **4** | Alert row | Click one alert row (or "View" link). | Navigate to `/alerts/[alertId]`. |
| **5** | Alert detail | Briefly scroll. Optionally point at "Open case" or "Acknowledge." | Alert title, rule name, triggered conditions, key stats, actions. |
| **6** | Sidebar → Cases | Click **Cases** in left nav. | Cases list. |
| **7** | Case row | Click one case row. | Navigate to `/cases/[caseId]`. |
| **8** | Case detail | Point at notes, evidence, status. | Case header, notes section, evidence/attachments, status badge. |
| **9** | Sidebar → Rules | Click **Rules** in left nav. | Rules list. Optionally click **New rule** or one rule to show rule builder/detail. |
| **10** | Sidebar → CDR | Click **CDR** (or **Imports** / **Explorer**). | Either imports table (`/cdr/imports`) or CDR explorer with filters (`/cdr/explorer`). Point at one import or a sample result set. |
| **11** | Reports or Analytics | Click **Reports** or **Analytics** in nav; open one view. | e.g. `/reports` or `/analytics/fraud-patterns` or `/analytics/revenue-leakage`. Point at one chart or table. |
| **12** | (Optional) Settings | Click **Settings** if time. | Org or profile settings — one quick glance. |

**Flow summary:** Login → Dashboard → Alerts (list → one detail) → Cases (list → one detail) → Rules → CDR (imports or explorer) → Reports/Analytics → [Settings].

---

## 4. Screen navigation summary (for Product Demo 0:30 – 2:30)

Do this in one continuous flow; avoid long pauses. Total ~2 minutes.

| Order | Route | What to show | ~Time |
|-------|--------|--------------|--------|
| 1 | `/login` | Brief: "Login with Supabase Auth." Sign in with seed user. | 0:15 |
| 2 | `/dashboard` | KPI cards (Calls, Duration, Revenue, etc.), alert/case summary, charts. Say: "Central view of fraud and revenue KPIs." | 0:25 |
| 3 | `/alerts` | Alert list with filters. Click one alert. | 0:20 |
| 4 | `/alerts/[alertId]` | Alert detail, explainability, actions. "We can acknowledge or open a case." | 0:15 |
| 5 | `/cases` | Case list. Click one case. | 0:15 |
| 6 | `/cases/[caseId]` | Case detail, notes, evidence, status. "Case management for investigations." | 0:15 |
| 7 | `/rules` | Rules list. Optionally open one rule or "New rule" to show rule builder. | 0:15 |
| 8 | `/cdr/imports` or `/cdr/explorer` | "CDR ingestion and explorer" — show imports or sample CDR data. | 0:15 |
| 9 | `/reports` or `/analytics/*` | One report or analytics view (e.g. fraud patterns / revenue leakage). "Reporting and analytics." | 0:15 |

**Total demo:** ~2 min. If you have extra time, add:
- **Settings** (`/settings`) — org/settings glimpse.
- **Analytics** — e.g. `/analytics/fraud-patterns` or `/analytics/revenue-leakage`.

---

## 5. Route reference (quick copy-paste)

```
/login
/dashboard
/alerts
/alerts/[pick one alert ID from your seed data]
/cases
/cases/[pick one case ID from your seed data]
/rules
/cdr/imports
/cdr/explorer
/reports
/analytics/fraud-patterns
/analytics/revenue-leakage
/settings
```

**Tip:** Before recording, open each URL in a tab so you can click through quickly without typing.

---

## 6. Pre-recording checklist

- [ ] App is **live on Vercel** and loads without errors.
- [ ] **Login/signup** works (use seed user).
- [ ] **Seed data** is visible: dashboard has numbers, alerts/cases lists are populated, CDR imports exist.
- [ ] No **console errors** on login, dashboard, alerts, and cases.
- [ ] **Mobile view** is acceptable (optional quick check).
- [ ] **Mic** is clear; **browser zoom** ~100% and **resolution** reasonable (e.g. 1920×1080 or 1280×720).
- [ ] **Google Drive** link set to *Anyone with the link can view* after upload.

---

## 7. Judging criteria (reminder)

| Criteria | What judges look for |
|----------|----------------------|
| **Product Hunt** | Upvotes, engagement, comments on launch day |
| **Functionality** | Core features work, no critical bugs, end-to-end usable |
| **Usability** | Clean UI, intuitive flows, seed data visible, mobile-friendly |
| **Code quality** | Clean structure, readable code, good practices |
| **Code security** | No exposed secrets, input validation, auth implemented correctly |
| **Video quality** | Clear demo, good audio/video, follows the 5-section template |

---

Good luck with the demo. — TeleGuard Pro × AI Mahakurukshetra 2026
