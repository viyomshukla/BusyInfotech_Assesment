# Riverside Clinic — Scheduling

A full-stack clinic scheduling application. The front desk publishes provider
availability, books patients into it, works a live queue of unconfirmed
appointments, and keeps a waitlist for the days that are already full;
providers see only their own schedule and write clinical notes on the visits
they attend.

The day itself prints on paper for the desk that still works off a clipboard.

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
- [The waitlist](#the-waitlist)
- [The printed day sheet](#the-printed-day-sheet)
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
- Keep a **waitlist** for days that are already full, and place someone into a
  slot the moment one frees up.
- Record **billing notes** against a visit — a code, an amount, and what is
  being charged for.
- Add provider accounts. The clinic runs exactly one front-desk account.
- Export any day's schedule as CSV, or **print it** as a working day sheet.

**For providers**

- See only the appointments where they are the scheduling provider or a member
  of the care team — enforced server-side on every list, detail, dashboard, and
  export endpoint.
- Move visits through check-in and completion, and mark no-shows.
- Write clinical notes (providers only) and edit the notes they authored.
- Add and remove supporting providers on their own appointments.

**For both**

- A dashboard with headline counts, a per-provider load bar chart, a status
  breakdown, and an 8-week no-show rate trend line.
- A day sheet laid out as a time grid across providers, which opens on the
  current hour and lays each visit out according to how long it runs.
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
| `drviyom@clinic.test` | Provider |

The seed builds the diary from 21 days back through to 30 September, ten slots a
day on a weekday and six on a Saturday, across all four providers — roughly
1,500 appointments over 40 patients. The status mix is realistic: past slots
resolve to completed or no-show, today's sheet spreads across the workflow, and
future ones stay open, requested or confirmed. Around one booked appointment in
five carries a second doctor on the care team, which is what the day sheet
prints under the patient's name. It also plants six unconfirmed appointments
between 40 minutes and 22 hours out, so the alerts view has both urgent and
ordinary rows.

**No provider is ever double-booked.** Every slot is half an hour, matching the
grid of start times, and the six alert appointments cannot sit on that grid — an
alert has to be a fixed number of minutes from whenever the seed is run, so they
land on the quarter hours in between. A half-hour appointment at 14:15 runs
straight through the 14:30 slot, which is a doctor seeing two patients at once.
Where the two collide the grid gives way: the colliding slots are dropped, and a
final pass over everything refuses to write at all if any provider is left with
two appointments overlapping. `insertMany` never reaches the service layer's
overlap check, and the unique index only catches two rows starting at the very
same instant, so without that pass nothing would catch it.

It also seeds **billing notes** on every third completed visit (not all of them,
because the point of the split is that a visit can carry a clinical note, a
billing note, or both), and **nine waitlist entries** — seven waiting, one
already placed and one taken off the list, with their windows anchored to the
day the seed runs so the queue is live whenever the demo is opened.

The sequence is seeded from a fixed number, so two runs produce the same clinic.

---

## Domain model

### `User`

`email` (unique, lowercased), `passwordHash`, `name`, `role`.
Roles are `FRONT_DESK` and `PROVIDER`. `toJSON` strips the hash, so it can never
leak through a response. `checkPassword` wraps the bcrypt compare.

### `Patient`

`name`, `phone`, `email`. Created on the fly when the front desk books a slot
for a walk-in name rather than an existing record.

`phone` is optional, but a half-typed number is worse than none — it looks like
a way to reach the patient right up until someone tries. So a number, if given,
has to be exactly ten digits. Spaces and hyphens are how people write a number
down, so the API strips them and judges what is left; `98765 43210` and
`98765-43210` are both accepted and both stored as `9876543210`. Anything
shorter, longer, or carrying other characters is rejected with
**A phone number must be exactly 10 digits.** The rule lives in the route's Zod
schema, with a validator on the model behind it, and the booking form applies
the same test as you type so the error arrives before the request does.

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

`appointmentId`, `authorId`, `authorName`, `body` (≤ 5000 chars), plus a `kind`
of `CLINICAL` or `BILLING` and, on billing notes only, an optional `code` and
`amount`.

Two different notes live on a visit, written by opposite ends of the clinic for
two different readers. A clinical note is the provider's record of what happened;
a billing note is the desk's record of what it costs. They share a collection
because they share an author, a timestamp and an appointment — and they are split
by `kind` everywhere they are read, so neither turns up where the other belongs.

Who may write which follows the same logic: **clinical** notes are for providers
on the appointment (scheduling or care team), **billing** notes are front desk
only, and neither role can write in the other's column. Either way, only the
author can edit their own note. A note written before the split existed has no
`kind` and is read as clinical, because that is the only kind that existed when
it was written.

### `WaitlistEntry`

Someone who wants a day that has nothing left on it. See
[The waitlist](#the-waitlist) for how it is worked.

| Field | Purpose |
| --- | --- |
| `patientName` / `phone` | Who to ring, and on what number. Same ten-digit rule as `Patient`. |
| `providerId` / `providerName` | Who they asked for. Null means any provider will do, which is the answer that gets them seen soonest. |
| `preferredFrom` / `preferredTo` | The window they can actually come in, stored as local day bounds so a slot anywhere on the last day still counts as inside it. |
| `status` | `WAITING`, `PLACED` or `REMOVED`. |
| `placedAppointmentId` / `placedAt` | The slot they were given, once they have one. |
| `note` | Anything reception needs when they ring back. |
| `addedById` / `addedByName` | Who took the call. |

An entry holds **no `Patient` record**. A waitlist entry may never turn into a
visit, and a list of half-patients created by hopeful phone calls is worse than
no list — so the `Patient` is created at the moment of placement, by the same
booking path as any other appointment.

Indexed on `{ status, preferredFrom, preferredTo }` and `{ status, providerId }`,
which are the two questions the day sheet asks of an open slot.

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

Authentication is a JWT signed for 7 days. It travels in an httpOnly cookie
named `token`, and `requireAuth` also accepts it as `Authorization: Bearer …`
— Safari blocks the cross-site cookie by default, so the frontend keeps the
token from `/auth/login` and sends it as a header as well. `requireRole(...)`
gates by role.

| Capability | Front desk | Provider |
| --- | --- | --- |
| See all appointments | ✅ | ❌ — own + care-team only |
| Create / edit / archive slots | ✅ any provider | ✅ own schedule only |
| Book a patient | ✅ | ✅ own schedule only |
| Change status | ✅ | ✅ own schedule only |
| Bulk-generate availability | ✅ | ❌ |
| Reassign to another provider | ✅ | ❌ |
| Confirm / cancel from the alerts feed | ✅ | ✅ own schedule only |
| Dismiss alerts | ✅ | ❌ (can still see their own) |
| Write clinical notes | ❌ | ✅ on appointments they run or support |
| Write billing notes | ✅ | ❌ |
| Edit a note | ✅ their own | ✅ their own |
| Add to / place from / remove from the waitlist | ✅ | ❌ — no access at all |
| Print a day sheet | ✅ any provider | ✅ their own day |
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

A provider's feed carries the appointments they run *and* the ones they only
support, because both are on their day. **Confirm** and **Cancel** are offered
on the ones they run — the same rule the API enforces — and a supported row says
whose appointment it is instead of showing buttons it would be refused. Cancel
asks for a reason, which the record keeps. **Dismiss** only silences the alert
without settling the appointment, so it stays a front-desk action.

The frontend polls the feed every 60 seconds and shows the count as a badge in
the sidebar.

---

## The waitlist

Reception's answer to "there's nothing left on Thursday". The entry is a
standing request, not a booking: it holds no time and blocks nothing, and it
stays `WAITING` until a slot frees up and someone is placed into it.

**Placing** is the point of the feature. Opening *Find a slot* on an entry lists
every open slot inside the window that patient gave, with the provider they
asked for if they named one, grouped by day. Choosing one books it through the
ordinary `bookSlot` path — so the status machine, the `Patient` record and the
audit trail all behave exactly as they do for a booking taken over the counter —
and marks the entry `PLACED` against the appointment it produced.

The rules the API enforces on a placement:

- The slot must still be **open**, not archived, and not already taken by
  someone else in the meantime (409).
- The slot must be **inside the window** the patient gave, and with the provider
  they asked for if they asked for one. The entry is a promise about when and
  with whom; placing them outside it would be booking an appointment they never
  agreed to.
- **The slot must not have started yet.** Someone is being rung up and asked to
  come in — a slot earlier today has gone. The list on screen only offers time
  still to come, but a list is always a few seconds old, so the check is made
  again at the moment it counts.

The list is worked as a queue and numbered in the order the calls came in.
Placement is deliberately **not automatic**: a person rings the patient and asks,
and the software's job is to have the right names and the right slots side by
side when they do.

**The day sheet knows about it.** When people are waiting for the day being
looked at, a banner names them and links through to the waitlist with that day
already filtered — reception spots the gap on one page and the people who would
take it are on another, and that is the bridge.

One deliberate gap: the placement writes the booking and the entry separately,
because booking runs in its own transaction. It fails in the safe direction — the
entry stays `WAITING` next to a booking that plainly exists, which reads as work
still to do. The reverse, an entry marked placed with nothing booked, would
quietly drop a patient off the list.

---

## The printed day sheet

`/day/print` renders the day as paper. It sits **outside the app shell** on
purpose: the sidebar and the toolbar are not part of what goes on the clipboard,
and the cleanest way to keep them off the page is not to render them. It is
still behind the session — it is patient data.

It is not a screenshot of the screen. The sheet carries a tick box per row for
marking arrivals, a blank ruled column to write in, cancelled rows struck
through with their reason so nobody wonders about the gap, and column headings
that repeat at the top of every page. Print rules in `index.css` set A4 with
proper margins, drop every shadow, and stop a row breaking across a page turn.
The one piece of colour kept is the status rule down the edge of each row, which
browsers would otherwise drop — `print-color-adjust: exact` insists on it.

The Print button on the day sheet opens it in a new tab with the current date
and provider filter, and fires the print dialog on arrival; opening the URL
directly just shows the sheet. The underlying query opts out of the app-wide
15-second refresh, because a sheet on a clipboard and a sheet in the print
dialog disagreeing about the day would be worse than a slightly stale one.

---

## API reference

Base URL: `${VITE_API_URL}/api`. All routes except `/auth/login`,
`/auth/logout`, `GET /`, and `GET /health` require the session cookie.

### Auth — `/api/auth`

| Method | Path | Who | Body / notes |
| --- | --- | --- | --- |
| `POST` | `/login` | anyone | `{ email, password }` → sets the cookie and returns the user plus a `token` field for browsers that refuse the cookie. Distinguishes "no account with that email" from "that password is not correct" (both 401). |
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
| `POST` | `/:id/book` | `{ patientId }` or `{ patientName, phone? }` — creates the patient if needed; `phone` must be exactly 10 digits when given. Moves `OPEN → REQUESTED`. |
| `POST` | `/:id/status` | `{ to, reason? }`. Reason mandatory for `CANCELLED`. |
| `POST` | `/:id/reassign` | `{ providerId }`. Front desk only; 409 if the target provider is busy then. |
| `POST` | `/:id/archive` · `/:id/restore` | Soft delete and undo. |
| `POST` | `/:id/notes` | `{ body }` (1–5000 chars) plus `kind` (`CLINICAL`, the default, or `BILLING`) and, for billing only, `code?` and `amount?`. Clinical: providers on the appointment. Billing: front desk. A code or amount on a clinical note is a 400. |
| `PATCH` | `/notes/:noteId` | `{ body, code?, amount? }`. Author only. The kind cannot be changed — it decided who was allowed to write the note in the first place. `code: ""` or `amount: null` clears the field rather than leaving it as it was. |
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

### Waitlist — `/api/waitlist`

Front desk only, end to end — a provider gets 403 on every route here. The
waitlist is a reception job from the call to the callback, and a provider has no
action to take on it.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/` | `{ items, count }`, oldest first — the list is a queue. Query: `status` (`WAITING` default, `PLACED`, `REMOVED`, or `ALL`), `date` (entries whose window covers that day), `providerId` (entries asking for that provider **plus** the ones happy with anybody). |
| `POST` | `/` | `{ patientName, phone?, providerId?, preferredFrom, preferredTo?, note? }`. Dates are `YYYY-MM-DD` and are stored as local day bounds; `preferredTo` defaults to `preferredFrom`. An empty string for provider means "no preference" and lands as null. |
| `POST` | `/:id/place` | `{ appointmentId }` → `{ entry, appointment }`. Books the slot in that patient's name and marks the entry `PLACED`. 422 if the entry is not waiting, if the slot is outside their window or with the wrong provider, or if the slot has already started; 409 if someone else took the slot first. |
| `DELETE` | `/:id` | Marks the entry `REMOVED`. Nothing is deleted — the list keeps its history. |

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
| `/day` | Day sheet — a time grid across providers, with prev/next day, a new-slot modal, CSV export and Print | all |
| `/day/print` | The printable day sheet, rendered outside the app shell | all |
| `/appointments` | Filterable list; every filter lives in the URL, so views are shareable and survive a refresh | all |
| `/appointments/:id` | Detail — status actions, booking, reschedule, cancel-with-reason, care team, reassign, clinical/billing notes, and the full audit timeline | all |
| `/alerts` | Urgent and upcoming unconfirmed appointments, with confirm, cancel and dismiss | all |
| `/waitlist` | The queue, with add, find-a-slot and remove | front desk |
| `/availability` | Bulk slot generator with a created/skipped report | front desk |
| `/staff` | Staff directory and the add-provider form | front desk |

**How it hangs together**

- `AuthContext` calls `/auth/me` once on mount and holds `{ user, loading,
  login, logout, isFrontDesk, isProvider }`, so a refresh restores the session.
  `lib/api.js` also stores the login token under `riverside.token` and attaches
  it as a bearer header on every request — the cookie carries the session where
  the browser keeps it, the header covers Safari where it does not.
- `ProtectedRoute` renders a loading state while that resolves, redirects to
  `/login` with the attempted location in router state, and shows a polite
  "front desk only" panel rather than a hard redirect when the role is wrong.
- **The board keeps itself current.** Two people work this schedule at once —
  the front desk checks a patient in while the provider has the same day sheet
  open on another screen — so TanStack Query is configured once with
  `refetchInterval: 15s`, `staleTime: 10s`, and refetch on window focus and on
  reconnect. The interval is suspended while the tab is hidden and resumes on
  focus, and `useProviders` opts out of it because the roster does not change
  every fifteen seconds. None of this is announced in the interface — refreshing
  is the app's job, not something to ask the reader to keep an eye on, so the
  only sign of it is the existing hairline progress bar.
  `useAppointmentMutation` still invalidates the `appointment`,
  `appointments`, `dashboard`, and `alerts` keys on every success, so a local
  change lands immediately rather than waiting for the next poll.
- **The day sheet opens where the day actually is.** Arriving at 12:43 on a grid
  that starts at 08:00 meant scrolling past four hours of finished appointments
  to find out what is happening now, so the grid anchors on the hour before the
  current one — 11:00 at the top at 12:43 — leaving the morning a scroll
  upwards. It anchors once per day rather than on every clock tick, because
  re-running it would yank the grid out from under whoever is reading it, and a
  **Now** button re-anchors on demand (smoothly, unless the browser asks for
  reduced motion).
- **A block says as much as it has room to say.** A fifteen-minute visit is not
  a squashed thirty-minute one, so `blockTier()` picks one of four layouts by
  height: a single line of `09:00  Jane Doe` under 34px, a stacked time and name
  under 52px, one spare line for the supporting doctor under 74px, and the full
  card with a status badge above that. On the short tier the
  *time* gives up its width before the name does — the block already sits at its
  own time on the grid, so the name is the fact worth keeping. Whatever a block
  could not print is on its hover title. The grid draws at 2px per minute for
  the same reason: at 1.6 a quarter-hour block was 24px tall, which was less
  than the two lines inside it needed, and the patient's name was being clipped
  off the bottom of every short appointment.
- `components/ui.jsx` is the whole design system — `Button`, `Panel`,
  `PageHeader`, `Field`, `Input`, `Textarea`, `Select`, `SegmentedControl`,
  `Stat`, `StatusBadge`, `EmptyState`, `Spinner`, `Loading`, `PageLoader`,
  `InlineLoading`, `ErrorNote`, `Modal`.
- **Waiting is always visible.** Every wait resolves to the same thing: a
  turning circle over **Please wait…** and a line saying what is being fetched.
  `PageLoader` covers the whole screen while the session is being checked,
  `Loading` fills a panel while its data is on the way, `InlineLoading` sits
  beside a row being acted on, and `Button` takes a `loading` prop that puts a
  spinner inside the button and disables it for the duration. A hairline
  progress bar across the top of the window tracks `useIsFetching` +
  `useIsMutating`, so background refetches are visible without blanking a panel
  that already holds good data.
- **Routes are code-split.** Every page behind the session is a `lazy()` import
  behind a `Suspense` boundary that renders the same waiting state, so the
  charting library loads with the dashboard rather than with the login screen —
  the initial bundle is 362 kB (116 kB gzipped) instead of 837 kB. The waitlist,
  the printed sheet and every other page added since arrive the same way, which
  is why that first number has not moved.
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

**The seed checks its own work.** A provider is one person in one room, so two
of their appointments can never overlap. Nothing the seed writes goes through
the service layer that normally enforces that, so it runs its own overlap pass
over everything it is about to insert and throws rather than writing a clinic
where a doctor sees two patients at once. The failure it exists to catch is a
real one it used to produce — see [Demo accounts](#demo-accounts).

**A waitlist entry creates no patient.** Most of them never become a visit, and a
patient list full of half-records from hopeful phone calls is worse than no
waitlist. The `Patient` is created at placement, by the ordinary booking path.

**Time checks happen at the moment they count.** The waitlist only offers slots
still to come, but the list on screen is always a few seconds old, so the API
refuses a slot that has already started regardless of what the client asks for.
That guard is on placement only — the front desk booking a walk-in against a
slot that started five minutes ago is a real thing, and blocking it everywhere
would break it.

**The printed sheet is a different document, not the same one with CSS.** It has
its own route outside the shell, its own layout, a tick box and a column to
write in — because it is used differently from the screen it came from.

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
| `npm run seed` | **Destructive.** Wipes users, patients, appointments, notes, events, alert dismissals and waitlist entries, then rebuilds the demo dataset. |
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

Safari goes further: "Prevent cross-site tracking" is on out of the box, and it
drops a `SameSite=None` cookie from a different registrable domain no matter how
it is configured. That is why `/auth/login` also returns the token in the body
and `requireAuth` accepts a bearer header — Safari signs in on the header while
every other browser keeps using the cookie. Putting the API behind the site's
own domain (a `/api` proxy or an `api.` subdomain) would make the cookie
first-party and remove the need for the fallback.

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

**"Not authenticated" in Safari, fine in Chrome** — Safari is blocking the
cross-site session cookie. The bearer-token fallback in `lib/api.js` covers it,
so make sure both sides are on the current build; if it comes back, check that
`localStorage` is reachable (a locked-down private window blocks it too).

**The first request takes forever** — Render's free tier sleeps the API when it
is idle. The loading state says so after four seconds; the wake-up can take
close to a minute, and everything after it is normal speed.

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

**Two patients on one doctor at the same time** — a database seeded before the
overlap pass existed. The old seed dropped its six alert appointments onto the
quarter hours on top of a diary sitting on the half hours, so a 14:15 booking
ran through the 14:30 slot. Re-run `npm run seed`: it now clears whatever those
land across and refuses to write at all if any provider is left double-booked.

**"Seed would double-book Dr Patel: … runs into …"** — working as intended. The
seed found a clash in what it was about to write and stopped before writing
anything, so the database is untouched. It means a change to the slot grid or
the alert offsets has put two appointments for one provider on top of each other.

**The waitlist says 403 for a provider** — intended, and not a page they are
shown. The waitlist is a front-desk workflow from the call to the callback, so
the nav link, the day-sheet banner and all four API routes are reception-only.

**"That slot has already started"** — the waitlist was offering a slot that has
since gone by while the list sat open. Close and reopen *Find a slot*; the list
only offers time still to come.
