# Riverside Clinic — Scheduling

A full-stack clinic scheduling application. The front desk publishes provider
availability, books patients into it, and works a live queue of unconfirmed
appointments; providers see only their own schedule and write visit notes on
the visits they attend.

Every change to an appointment is written to an append-only event log, so the
detail page can show exactly who did what and when.

```
Busy Infotech/
├── backend/     Express 5 + MongoDB (Mongoose) REST API, cookie-session auth
├── frontend/    React 19 + Vite + Tailwind v4 SPA
└── render.yaml  Render blueprint for the API service
```

---

## Table of contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Demo accounts](#demo-accounts)
- [Domain model](#domain-model)
- [The appointment status machine](#the-appointment-status-machine)
- [Roles and permissions](#roles-and-permissions)
- [Alerts](#alerts)
- [API reference](#api-reference)
- [Frontend tour](#frontend-tour)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## What it does

**For the front desk**

- Generate availability in bulk — pick a provider, a date range, weekdays, and
  one or more time blocks; the API creates every non-clashing slot and reports
  what it skipped and why.
- Create, edit, book, cancel, and archive individual slots.
- Move an appointment to a different provider, with a clash check on the
  destination provider's calendar.
- Work an alerts queue of appointments still unconfirmed within the next 24
  hours; confirm or dismiss each one.
- Add provider accounts. The clinic runs exactly one front-desk account.
- Export any day's schedule as CSV.

**For providers**

- See only the appointments where they are the scheduling provider or a member
  of the care team — enforced server-side on every list, detail, dashboard, and
  export endpoint.
- Move visits through check-in and completion, and mark no-shows.
- Write visit notes (providers only) and edit the notes they authored.
- Add and remove supporting providers on their own appointments.

**For both**

- A dashboard with headline counts, a per-provider load bar chart, a status
  breakdown, and an 8-week no-show rate trend line.
- A day sheet laid out as a time grid across providers.
- A filterable, sortable, paginated appointment list with a patient-name search.
- A full audit timeline on every appointment.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js ≥ 20, ES modules throughout |
| API | Express 5 |
| Database | MongoDB (Atlas in production) via Mongoose 9 |
| Validation | Zod 4, applied as route middleware |
| Auth | JWT in an httpOnly cookie; bcryptjs password hashes |
| Hardening | helmet, an explicit CORS allowlist, morgan request logs |
| UI | React 19, React Router 7, Vite 8 |
| Data fetching | TanStack Query 5 |
| Styling | Tailwind CSS v4 (`@theme` tokens in `index.css`, no config file) |
| Charts | Recharts 3 |
| Icons | lucide-react |
| Dates | date-fns 4 (shared by both halves) |
| Lint | oxlint (frontend) |

---

## Getting started

**Prerequisites:** Node 20+, npm, and a MongoDB connection string. A local
`mongod` works, but every write path uses a transaction, which requires a
**replica set** — Atlas (free tier is fine) is the smoother path. See
[Troubleshooting](#troubleshooting) to run a single local node instead.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in MONGO_URI and JWT_SECRET
npm run seed              # wipes and repopulates the database
npm run dev               # nodemon on http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000
npm run dev               # Vite on http://localhost:5173
```

Open http://localhost:5173 and sign in with one of the
[demo accounts](#demo-accounts). The login page has one-click buttons that fill
the credentials for you.

---

## Environment variables

### `backend/.env`

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `PORT` | no | `5000` | Defaults to 5000. **Do not set this on Render** — the platform supplies it. |
| `MONGO_URI` | **yes** | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/riverside` | Startup fails fast if missing. |
| `JWT_SECRET` | **yes** | a long random string | Signs and verifies the session cookie. |
| `CLIENT_ORIGIN` | **yes** | `http://localhost:5173,https://app.example.com` | Comma-separated allowlist of browser origins. Trailing slashes are tolerated. |
| `NODE_ENV` | no | `development` \| `production` | In `production` the cookie becomes `Secure` + `SameSite=None` and morgan switches to the `combined` format. |

### `frontend/.env`

| Variable | Required | Example | Notes |
| --- | --- | --- | --- |
| `VITE_API_URL` | **yes** | `http://localhost:5000` | Base URL of the API — **no** trailing slash and **no** `/api` suffix; the axios client appends `/api` itself. |

Vite inlines this at build time, so a deployed frontend must be rebuilt after
the value changes.

---

## Demo accounts

Created by `npm run seed`. Every account uses the password `password123`.

| Email | Role |
| --- | --- |
| `desk@clinic.test` | Front desk |
| `drpatel@clinic.test` | Provider |
| `drsingh@clinic.test` | Provider |
| `driyer@clinic.test` | Provider |

The seed builds roughly five weeks of appointments (21 days back, 14 forward) at
six slots a day across three providers, with a realistic status mix — past slots
resolve to completed or no-show, future ones stay open or confirmed. It also
plants four unconfirmed appointments starting 40 minutes, 50 minutes, 5 hours,
and 20 hours out, so the alerts view has both urgent and ordinary rows.

---

## Domain model

### `User`

`email` (unique, lowercased), `passwordHash`, `name`, `role`.
Roles are `FRONT_DESK` and `PROVIDER`. `toJSON` strips the hash, so it can never
leak through a response. `checkPassword` wraps the bcrypt compare.

### `Patient`

`name`, `phone`, `email`. Created on the fly when the front desk books a slot
for a walk-in name rather than an existing record.

### `Appointment`

The centre of the system. One document is both an availability slot and, once
booked, the appointment itself.

| Field | Purpose |
| --- | --- |
| `providerId` / `providerName` | The scheduling provider. The name is denormalised so list views and CSV exports need no join. |
| `patientId` / `patientName` | Null while the slot is `OPEN`. |
| `startsAt` / `endsAt` / `durationMin` | The window. `endsAt` is always derived from start + duration. |
| `status` | One of the seven statuses below. |
| `cancelReason` / `cancelledAt` | Set together, only on cancellation. |
| `archivedAt` | Soft delete. Archived rows are excluded from every default query. |
| `careTeam[]` | Supporting providers, each with `providerId`, `assignedBy`, `assignedAt`. Grants read access and the right to write notes. |

Indexes cover the query shapes the app actually issues — `providerId + startsAt`,
`status + startsAt`, `startsAt`, `careTeam.providerId`, and a text index on
`patientName`.

There is also a **unique partial index** named `uniq_provider_slot_active` on
`{ providerId, startsAt }`, filtered to non-archived, non-cancelled rows. The
service layer already checks for overlaps, but two simultaneous requests can
both pass that check; the index is the backstop that makes the second one fail.
Cancelled slots are excluded so their time becomes bookable again — MongoDB
partial filters reject `$ne`, hence the explicit `$in` list of time-occupying
statuses.

### `AppointmentEvent`

The audit log: `appointmentId`, `actorId`, `actorName`, `type`, `fromStatus`,
`toStatus`, a free-form `detail`, and an immutable `createdAt`. Event types are
`CREATED`, `STATUS_CHANGED`, `CANCELLED`, `PROVIDER_REASSIGNED`,
`SUPPORT_ADDED`, `SUPPORT_REMOVED`, `NOTE_ADDED`, `ARCHIVED`, `RESTORED`.

The schema registers `pre` hooks on every update and delete operation that throw
`Appointment events are append-only`, so the log cannot be rewritten through
Mongoose even by accident.

### `VisitNote`

`appointmentId`, `authorId`, `authorName`, `body` (≤ 5000 chars). Only providers
on the appointment can write one; only the author can edit it.

### `AlertDismissal`

One row per dismissal — `appointmentId`, `dismissedBy`, `dismissedByName`,
`dismissedAt`. Kept as a history rather than a flag on the appointment, which is
what lets a dismissed alert legitimately come back (see [Alerts](#alerts)).

---

## The appointment status machine

Defined once in `backend/src/services/statusMachine.js` and enforced on every
transition.

```
OPEN ──► REQUESTED ──► CONFIRMED ──► CHECKED_IN ──► COMPLETED
  │           │             │
  │           │             └──────► NO_SHOW
  └───────────┴─────────────┴──────► CANCELLED
```

| From | May move to |
| --- | --- |
| `OPEN` | `REQUESTED`, `CANCELLED` |
| `REQUESTED` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `CHECKED_IN`, `NO_SHOW`, `CANCELLED` |
| `CHECKED_IN` | `COMPLETED` |
| `COMPLETED` / `NO_SHOW` / `CANCELLED` | nothing — terminal |

Additional rules, each with a message written for the person reading it:

- Cancelling **requires a non-empty reason**, stored on the appointment and in
  the event log.
- An appointment **cannot be cancelled once the patient has checked in** or the
  visit is complete.
- **No-show cannot be set before the appointment's start time** has passed.
- Re-applying the current status is rejected outright.

Violations throw `RuleError`, which carries an HTTP status (422 by default, 403
and 404 where appropriate) that the Express error handler turns into a JSON
`{ error }` response.

---

## Roles and permissions

Authentication is a JWT stored in an httpOnly cookie named `token`, signed for
7 days. `requireAuth` verifies it and loads the user; `requireRole(...)` gates
by role. The frontend never touches the token — it just sends
`withCredentials: true`.

| Capability | Front desk | Provider |
| --- | --- | --- |
| See all appointments | ✅ | ❌ — own + care-team only |
| Create / edit / archive slots | ✅ any provider | ✅ own schedule only |
| Book a patient | ✅ | ✅ own schedule only |
| Change status | ✅ | ✅ own schedule only |
| Bulk-generate availability | ✅ | ❌ |
| Reassign to another provider | ✅ | ❌ |
| Dismiss alerts | ✅ | ❌ (can still see their own) |
| Write / edit visit notes | ❌ | ✅ own notes only |
| Manage the care team | ✅ | ✅ own appointments |
| Add staff accounts | ✅ providers only | ❌ |
| List all users | ✅ | ❌ (provider list only) |

Scoping is applied in the data layer, not just the UI: a provider's list,
dashboard aggregation, alert feed, day sheet, and CSV export all carry an
`$or: [{ providerId: me }, { 'careTeam.providerId': me }]` filter, and asking for
another provider's data by id returns 403.

Registration is deliberately **not public** — `POST /api/auth/register` requires
an authenticated front-desk session, and a second `FRONT_DESK` account is
rejected with 409. Bootstrap the first one with the seed script.

---

## Alerts

An appointment raises an alert when it is still `REQUESTED` and starts within
the next 24 hours. The rules:

- **Urgent** — the appointment starts within the next hour. Rendered with a red
  rule and a warning icon.
- **Dismissed** alerts drop out of the feed.
- **Reappeared** — an alert dismissed *before* the final hour comes back once
  the appointment enters that final hour, flagged `reappeared: true`. Something
  waved off yesterday shouldn't stay quiet 20 minutes before the patient is due.

Providers see only their own alerts; only the front desk can dismiss. The
frontend polls the feed every 60 seconds and shows the count as a badge in the
sidebar.

---

## API reference

Base URL: `${VITE_API_URL}/api`. All routes except `/auth/login`,
`/auth/logout`, `GET /`, and `GET /health` require the session cookie.

### Auth — `/api/auth`

| Method | Path | Who | Body / notes |
| --- | --- | --- | --- |
| `POST` | `/login` | anyone | `{ email, password }` → sets the cookie, returns the user. Distinguishes "no account with that email" from "that password is not correct" (both 401). |
| `POST` | `/logout` | anyone | Clears the cookie. |
| `GET` | `/me` | authed | The current user; the frontend calls this on boot to restore a session. |
| `POST` | `/register` | front desk | `{ email, password (≥8), name, role }`. 409 on a duplicate email or a second front-desk account. |

### Users — `/api/users`

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/providers` | authed | All providers, name-sorted. Feeds every provider picker. |
| `GET` | `/` | front desk | Every user, sorted by role then name. |

### Appointments — `/api/appointments`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/` | Filter, sort, paginate. Query: `q` (patient-name substring, regex-escaped), `providerId`, `status` (single or repeated), `from`, `to`, `sort` (`date` \| `status` \| `provider`), `dir` (`asc` \| `desc`), `page`, `limit` (≤100), `includeArchived`. Returns `{ items, total, page, limit, totalPages }`. |
| `GET` | `/:id` | `{ appointment, timeline, notes }`. 403 if a provider asks for an appointment that isn't theirs. |
| `POST` | `/` | Create one slot: `{ providerId, startsAt, durationMin (5–480) }`. 409 on overlap. |
| `PATCH` | `/:id` | Move or resize a slot: `{ startsAt?, durationMin? }`. Only while `OPEN`. |
| `POST` | `/:id/book` | `{ patientId }` or `{ patientName, phone? }` — creates the patient if needed. Moves `OPEN → REQUESTED`. |
| `POST` | `/:id/status` | `{ to, reason? }`. Reason mandatory for `CANCELLED`. |
| `POST` | `/:id/reassign` | `{ providerId }`. Front desk only; 409 if the target provider is busy then. |
| `POST` | `/:id/archive` · `/:id/restore` | Soft delete and undo. |
| `POST` | `/:id/notes` | `{ body }` (1–5000 chars). Providers on the appointment only. |
| `PATCH` | `/notes/:noteId` | `{ body }`. Author only. |
| `POST` | `/:id/care-team` | `{ providerId }` — add a supporting provider. |
| `DELETE` | `/:id/care-team/:providerId` | Remove one. |
| `GET` | `/mine/schedule` | A provider's full schedule; `?archived=true` to include archived. |
| `POST` | `/generate` | Bulk availability — see below. |
| `GET` | `/export/day` | `?date=YYYY-MM-DD&providerId=…` → a UTF-8 BOM'd CSV attachment. |

**`POST /generate`** takes `{ providerId, from, to, weekdays: [0–6], blocks: [{ startTime: "HH:MM", durationMin }] }`,
expands the pattern, and refuses anything over 500 slots. It checks each
candidate against existing appointments *and* against slots created earlier in
the same run, then returns:

```json
{
  "requested": 40,
  "createdCount": 37,
  "skippedCount": 3,
  "created": [{ "id": "…", "startsAt": "…", "durationMin": 30 }],
  "skipped": [{
    "startsAt": "…",
    "reason": "Collides with an existing booking",
    "conflictWith": { "startsAt": "…", "status": "CONFIRMED", "patientName": "Asha Rao" }
  }]
}
```

### Dashboard — `/api/dashboard`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/` | One `$facet` aggregation returning `headline` (today's count, checked in now, no-shows this week, upcoming confirmed), `byProvider`, `byStatus`, and `noShowTrend` (8 weeks, Monday-started, with a percentage rate). |
| `GET` | `/alerts` | `{ items, count }` — see [Alerts](#alerts). |
| `POST` | `/alerts/:appointmentId/dismiss` | Front desk only. |

### Service

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | `{ ok: true, time }` — Render's health check target. |
| `GET` | `/` | A plain hello payload. |

### Error shape

Everything fails the same way:

```json
{ "error": "Cancelling an appointment requires a reason." }
```

Zod rejections add detail:

```json
{
  "error": "Invalid request",
  "details": [{ "field": "durationMin", "message": "Number must be greater than or equal to 5" }]
}
```

Statuses used: `400` validation, `401` not authenticated, `403` not allowed for
your role, `404` not found, `409` conflict (duplicate email, overlapping slot),
`422` a business rule refused the transition, `500` unexpected.

The axios interceptor in `frontend/src/lib/api.js` flattens all of this into
`{ status, message, details }`, so any component can render `err.message`
directly — the API's wording is the wording the user sees.

---

## Frontend tour

| Route | Page | Who |
| --- | --- | --- |
| `/login` | Split-screen sign-in with one-click demo credentials | public |
| `/` | Dashboard — stat tiles, provider load, status mix, no-show trend | all |
| `/day` | Day sheet — a time grid across providers, with prev/next day, a new-slot modal, and CSV export | all |
| `/appointments` | Filterable list; every filter lives in the URL, so views are shareable and survive a refresh | all |
| `/appointments/:id` | Detail — status actions, booking, reschedule, cancel-with-reason, care team, reassign, notes, and the full audit timeline | all |
| `/alerts` | Urgent and upcoming unconfirmed appointments, with confirm and dismiss | all |
| `/availability` | Bulk slot generator with a created/skipped report | front desk |
| `/staff` | Staff directory and the add-provider form | front desk |

**How it hangs together**

- `AuthContext` calls `/auth/me` once on mount and holds `{ user, loading,
  login, logout, isFrontDesk, isProvider }`. Because the session is a cookie,
  a refresh restores it with no token juggling.
- `ProtectedRoute` renders a loading state while that resolves, redirects to
  `/login` with the attempted location in router state, and shows a polite
  "front desk only" panel rather than a hard redirect when the role is wrong.
- TanStack Query is configured once with `retry: 1`, `staleTime: 30s`, and no
  refetch on window focus. `useAppointmentMutation` invalidates the
  `appointment`, `appointments`, `dashboard`, and `alerts` keys on every
  success, so a status change updates the sidebar badge and the dashboard
  without any manual wiring.
- `components/ui.jsx` is the whole design system — `Button`, `Panel`,
  `PageHeader`, `Field`, `Input`, `Textarea`, `Select`, `StatusBadge`,
  `EmptyState`, `Skeleton`, `Loading`, `ErrorNote`, `Modal`.
- Tailwind v4 is configured entirely through `@theme` tokens in `index.css` —
  ink/muted/faint text, paper/surface grounds, a status colour per appointment
  state, three shadow levels, and Archivo + IBM Plex Mono. There is no
  `tailwind.config.js`. Status colours are exported from `lib/format.js` as
  `STATUS_COLOR` so charts and badges stay in step.
- Reduced motion is respected globally, focus rings are explicit, and the
  sidebar collapses into a scrollable top bar below the `lg` breakpoint.

---

## Design decisions worth knowing

**Dates are clinic-local, not UTC.** A `YYYY-MM-DD` from a date input means a
calendar day at the clinic. `utils/day.js` parses it from its parts rather than
letting `new Date()` read it as UTC midnight, which would slide the day for
anyone off UTC. The list endpoint's `to=` therefore covers the *end* of that
day, and the CSV export formats times with `date-fns`, never `toISOString()`.

**Writes run in transactions.** `withTransaction` wraps each mutation so the
appointment change and its audit event commit together — the log can never
disagree with the record. It also translates a duplicate-key error (11000) into
a readable 409. This is why MongoDB needs to be a replica set.

**Overlap is checked twice.** The service does a range query first so it can
return a helpful message naming the clashing slot; the unique partial index
catches the race the query cannot see.

**Provider and patient names are denormalised** onto the appointment. Lists, day
sheets, and exports render without a join; reassignment updates both fields and
records the before/after pair in the event detail.

**The audit log is structurally append-only** — enforced by schema hooks, not by
convention.

**CSV exports carry a UTF-8 BOM** (a leading `\uFEFF`) so Excel opens them in the right
encoding, and every cell is quote-escaped by `utils/csv.js`.

**CORS takes a list.** `CLIENT_ORIGIN` is comma-separated and trailing slashes
are trimmed on both sides, so one value covers local development and the
deployed frontend. Requests with no `Origin` header (curl, health checks,
same-origin navigations) are allowed through.

**Login errors are specific on purpose.** An unknown email and a wrong password
give different messages. That is a small user-enumeration trade-off, accepted
here for a staff-only tool where accounts are created by the front desk.

**`trust proxy` is set to 1** because Render terminates TLS at its edge; without
it `req.secure` and `req.ip` would be wrong behind the proxy.

---

## Scripts

### Backend

| Command | Does |
| --- | --- |
| `npm run dev` | nodemon on `src/server.js` |
| `npm start` | plain node — the production entry point |
| `npm run seed` | **Destructive.** Wipes users, patients, appointments, notes, and events, then rebuilds the demo dataset. |
| `npm run reindex` | Drops and rebuilds `uniq_provider_slot_active`. Run once per database after pulling the change that let cancelled slots free their time — Mongoose will not reshape an index that already exists under the same name. |

### Frontend

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server on 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the build locally |
| `npm run lint` | oxlint |

---

## Testing

The status machine has a standalone assertion suite that needs no database:

```bash
node backend/src/services/statusMachine.test.mjs
```

It covers the legal transitions plus every guard — the no-show time check, the
mandatory cancel reason, the post-check-in cancel block, and terminal states.
`npm test` in `backend/` is still the npm placeholder and exits 1.

---

## Deployment

### API on Render

`render.yaml` at the repo root is a ready blueprint:

- `rootDir: backend`, `buildCommand: npm ci`, `startCommand: npm start`
- health check on `/health`
- `NODE_ENV=production`, `JWT_SECRET` generated by Render
- `MONGO_URI` and `CLIENT_ORIGIN` marked `sync: false` — set them in the
  dashboard. `CLIENT_ORIGIN` must be the deployed frontend's exact origin.
- `PORT` is deliberately absent; Render provides it.

Allowlist Render's outbound IPs in MongoDB Atlas, or the connection will hang.

### Frontend on Vercel

`frontend/vercel.json` rewrites every path to `/index.html` so client-side
routes survive a hard refresh. Set `VITE_API_URL` to the Render URL as a build
environment variable and redeploy — Vite bakes it into the bundle.

### The cookie in production

With the API and the frontend on different domains, the session cookie must be
`SameSite=None; Secure`, which `utils/token.js` switches on when
`NODE_ENV=production`. That means production **must** be HTTPS on both sides,
and `CLIENT_ORIGIN` must list the frontend exactly — a mismatch shows up as a
login that appears to succeed but leaves you signed out.

---

## Troubleshooting

**"MONGO_URI is not set"** — `backend/.env` is missing or wasn't loaded.
`server.js` imports `dotenv/config` before anything else, so the file has to sit
in `backend/`, not the repo root.

**"Transaction numbers are only allowed on a replica set"** — every write path
uses a transaction. Use Atlas, or start a local single-node replica set:
`mongod --replSet rs0`, then `rs.initiate()` in `mongosh`.

**Login succeeds but you're bounced back to `/login`** — the cookie isn't
sticking. Check that `CLIENT_ORIGIN` matches the browser origin exactly, that
`VITE_API_URL` has no trailing slash and no `/api`, and that both sides are
HTTPS in production.

**Blocked by CORS** — add the origin to `CLIENT_ORIGIN` (comma-separated) and
restart the API. The value is read once at startup.

**"That provider already has a slot at exactly this time" (409)** — the unique
index did its job. If the clashing slot is cancelled and you still see this, the
old index shape is still in place: run `npm run reindex`.

**Charts or counts look wrong for a provider** — they should. Providers see only
their own appointments plus the ones where they're on the care team; the
dashboard aggregation is scoped the same way as the lists.

**Dismissed alerts came back** — intended. An alert dismissed before the final
hour returns when the appointment enters it, flagged "back after dismissal".
