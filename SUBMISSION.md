# Submission

**Riverside Clinic — Scheduling.** A tool for a small clinic's front desk and
its doctors. Reception publishes when each doctor is free, books patients into
those times, chases the appointments nobody has confirmed yet, and keeps a
waitlist for the days that are already full. Doctors see only their own day and
write up the visits they attend; reception keeps the billing against those same
visits. Every change is recorded with who made it and when, and the day itself
prints for the clipboard on the desk.

## Links

- **GitHub repository:** https://github.com/viyomshukla/BusyInfotech_Assesment
- **Live application:** https://busy-infotech-assesment.vercel.app/

## Notes for the reviewer

**Please give the first request up to a minute.** The API runs on Render's free
plan, which puts the server to sleep after about 15 minutes with no traffic. The
first page load or the first sign-in after a quiet spell has to wake it up, and
that takes 30–60 seconds. It looks like the app has frozen. It has not — it is
just cold. Everything after that is normal speed.

**Sign in as the front desk first.** The two roles genuinely see different
things, and that is one of the main points of the app. The front desk sees the
whole clinic. A doctor sees only their own appointments, and the difference is
enforced on the server, not just hidden in the interface — a doctor asking for
someone else's data directly gets refused.

**The login page fills the credentials for you.** There are five buttons on it,
one per demo account. Click one and the email and password are typed in.

**Try this, in this order — it shows most of the app in about five minutes:**

1. Sign in as the **front desk**. The dashboard shows today's numbers.
2. Open **Alerts**. There are appointments in the next 24 hours that nobody has
   confirmed; the ones starting within the hour are flagged in red. Confirm one
   and watch the red badge in the sidebar drop.
3. Open **Day sheet**. It opens on the current hour rather than at eight in the
   morning — the morning is a scroll upwards. One column per doctor, and no
   doctor ever has two patients side by side.
4. Hit **Print** on that day sheet. It opens a clean sheet in a new tab with a
   tick box per row and a blank column to write in, and puts the print dialogue
   up. The sidebar and the buttons are not on the paper.
5. Open any booked appointment. Try to **cancel it without typing a reason** —
   the app will not let you. Cancel it properly and watch the timeline at the
   bottom gain a line saying who did it and why. While you are there, look at the
   notes panel: **Clinical** and **Billing** are separate tabs, and as the front
   desk you can write in one of them and not the other.
6. Open **Waitlist**. Several people are waiting for days that are full, in the
   order they rang. Pick one and hit **Find a slot** — it lists only the open
   slots inside the window that patient gave, and only ones that have not
   already started. Give them a slot and they come off the list with a real
   booking behind them; the **Placed** tab shows the ones already dealt with.
7. Sign out and sign back in as **Dr Patel**. The same dashboard now shows only
   her numbers, and Availability, Staff and Waitlist are gone.

## Demo credentials

Every account uses the password `password123`.

| Role | Email | Password |
|------|-------|----------|
| Front desk | `desk@clinic.test` | `password123` |
| Provider (doctor) | `drpatel@clinic.test` | `password123` |
| Provider (doctor) | `drsingh@clinic.test` | `password123` |
| Provider (doctor) | `driyer@clinic.test` | `password123` |
| Provider (doctor) | `drviyom@clinic.test` | `password123` |

There is no sign-up page, and that is deliberate — this is a staff tool, and new
accounts are created by reception from inside the app.

## Stack

| Layer | What I used | Why |
|-------|---------------|-----|
| Frontend | React, Vite, Tailwind v4, React Router 7,  Recharts | Every page is behind a login, so there is nothing for a search engine to see and no reason to render pages on a server. A plain single-page app is simpler and deploys as static files. TanStack Query is doing the heavy lifting — it is why changing a status updates the dashboard and the sidebar badge without any code connecting them. |
| Backend | Node 20+, Express 5, Zod for validation | Small, boring, and the same language as the frontend, so date handling and helper code are shared rather than written twice. Zod checks every incoming request before it reaches any logic, so bad input is rejected in one consistent place. |
| Database | MongoDB (Atlas) with Mongoose | The appointment record has a genuinely variable shape — an empty slot has no patient, a cancelled one has a reason, some have a care team and most do not. A flexible document fits that better than a table full of empty columns. Mongoose still enforces a strict shape in code. |
| Hosting | Vercel (frontend), Render (API), MongoDB Atlas (database) | All three have a usable free tier. Render because the API is a long-running process; Atlas because every write in this app uses a transaction, which MongoDB only permits on a replica set. |

## Goal checklist

*The goals below are written in my own words from the brief.*

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Two roles with genuinely different access — front desk vs. provider | **Done** | Enforced on the server, not just in the interface. Every list, dashboard figure, alert feed, day sheet, and CSV export is filtered by who is asking. A doctor requesting another doctor's appointment gets a `403` however they ask for it. |
| 2 | Secure login and session handling | **Done** | Passwords hashed with bcrypt. The session is a signed token in an `httpOnly` cookie, so no JavaScript on the page can read it. Refreshing the browser keeps you signed in. No public sign-up — reception creates accounts. |
| 3 | Publish availability, including in bulk | **Done** | Pick a doctor, a date range, which weekdays, and one or more time blocks. It creates every slot that does not clash and reports back exactly what it skipped and why, naming the appointment that got in the way. Capped at 500 slots per run. |
| 4 | Book, reschedule, cancel, and move appointments | **Partial** | Booking, cancelling with a mandatory reason, reassigning to a different doctor (with a clash check on the destination), and archiving all work. **Rescheduling only works while a slot is still open** — once a patient is in it, the only route is cancel and rebook. That is the clearest gap in the app. |
| 5 | Enforce appointment rules properly | **Done** | Seven statuses with defined transitions, in [one file](backend/src/services/statusMachine.js). Cancelling needs a written reason. A checked-in patient cannot be cancelled. A no-show cannot be marked before the appointment's time has passed. Every refusal is a sentence written for a receptionist, not an error code. |
| 6 | Prevent double-booking | **Done** | Guarded three times now. The code checks for overlapping times first, so it can name the clashing slot. A unique database index sits underneath it for the case where two people click "book" in the same fraction of a second. And the seed script checks its own output before writing, because it turned out to be quietly producing exactly the thing the app refuses — both stories are in [decisions.md](docs/decisions.md). Cancelled appointments correctly release their time. |
| 7 | Visit notes | **Done** | Split in two. **Clinical** notes belong to providers, and only on appointments they are actually on — as the scheduling doctor or a member of the care team. **Billing** notes belong to the front desk, carrying a code and an amount with a running total for the visit. Neither role can write in the other's column. Only the author can edit their own note. |
| 8 | Alerts for appointments needing attention | **Done** | Anything still unconfirmed within 24 hours. Under an hour away is flagged urgent in red. The front desk can confirm or dismiss. A dismissed alert **comes back** if it was waved off more than an hour ahead and the appointment then enters its final hour, marked so nobody thinks it is a bug. The sidebar badge refreshes every minute. |
| 9 | Dashboard and reporting | **Done** | Four headline figures, a per-doctor load bar, a status breakdown, and an eight-week no-show trend. Scoped to whoever is looking. Any day's schedule exports to CSV, opening correctly in Excel. |
| 10 | Full audit trail | **Done** | Every change writes a permanent entry: who, when, from which status to which, and why. It is written in the same transaction as the change itself, so the record and the log can never disagree. The log is structurally append-only — the code that would edit or delete an entry throws an error. |

**The honest summary:** nine of ten complete, one partial. The gap is
rescheduling an appointment that already has a patient in it.

## Beyond the brief

The brief listed nine things as out of scope. I built three of them, because
they were the three a real front desk would miss first.

**A waitlist for full days.** When there is nothing left on Thursday, reception
takes the patient's name, number, the window they can actually come in, and
which doctor they want if they care. It is a queue, numbered in the order the
calls came in. When a slot frees up, *Find a slot* shows only the open slots
inside that patient's window — and only ones that have not already started,
because a slot at nine this morning is no use to somebody you are ringing at
two in the afternoon. Placing them books it through exactly the same code path
as a booking taken over the counter, so the status rules, the patient record and
the history log all behave normally. Nothing is placed automatically. A person
rings the patient and asks; the software's job is just to have the right names
and the right slots side by side when they do.

**A printable day sheet.** The desk still works off paper for the day itself —
it goes on a clipboard, gets ticked, gets written on. So it is not a screenshot
of the screen: it is its own page with the sidebar and the buttons gone, a tick
box per row for marking arrivals, a blank ruled column to write in, cancelled
rows struck through with their reason so nobody wonders about the gap, and
headings that repeat at the top of every page.

**Billing notes per visit.** A visit collects two different records written by
opposite ends of the clinic — what the doctor did, and what it costs. They sit
as two tabs on the same appointment rather than mixed into one list.

**What I did not build, and why.** Reminder messages and the overnight digest
both need an email or SMS account I do not have, and a "here is what we would
have sent" screen is a lot of work for something that never actually sends.
Recurring appointments and room assignment I simply ran out of time for.
Patient self-service booking is not a feature, it is a second application — a
public sign-up, a third role, rate limiting, and a careful re-audit of every
existing endpoint to be sure one patient cannot read another's record. Bolting
that onto a staff tool in a hurry is how patient data leaks.

## How much time did I actually spend?

About **26 hours**. Eighteen of those got the brief done across three days —
Friday afternoon (backend), Friday evening (all seven screens), Saturday morning
(bug fixes and deployment), Saturday evening and Sunday (documentation and a
pass on loading states). The other eight came the following week, on the
waitlist, the printed sheet, the billing split, and a day-sheet bug I would
rather have found myself.

I had estimated twelve for the brief. The extra six went almost entirely into
things that are invisible when they work: what a screen shows while it is
loading, what it shows when there is nothing there, and what it says when the
server refuses. The breakdown is in [docs/plan.md](docs/plan.md).

## What would I do next, with another 12 hours?

**First, rescheduling a booked appointment** (about 3 hours). This is the one promised feature that is still not completed. It is also one of the most common things a real front desk would need. The appointment should be moved to a new time, the new time should be checked to make sure it is available, and the patient and appointment history should stay connected. The change should also be added to the log

**Second, a patient directory** (about 3 hours). At the moment, patients are created whenever we type their name. Because of this, "Asha Rao" and "asha rao" can become two different patients, and their previous visit history is not connected. A patient directory where we can search, edit, and merge patients would solve this problem. It would also make it easier to see all the information about one patient in one place.

**Third, real tests** (about 3 hours). Having only one test file is not enough, especially because it covers less of the application than it did earlier. The permission rules are the most important thing I would test because a mistake there can become a privacy problem instead of just a normal application bug.
After that, I would test the waitlist placement rules. A slot should be inside the patient's available time, have the correct doctor, not already be booked, and should not have already started. These are four conditions that I currently check manually, but there is no automated test for them. I would use Supertest for the API and also add a test to make sure one doctor cannot access another doctor's patient data through any endpoint.

**Fourth, fixing the search before it becomes a problem** (about 2 hours). The
patient-name search reads every appointment in the database on every keystroke.
Fine at a few hundred. Not fine at fifty thousand.

**And with the last hour**, keyboard shortcuts on the day sheet. Reception staff
live on a keyboard, and reaching for a mouse to move to tomorrow is a small
irritation repeated two hundred times a day.

## What am I least happy with in this codebase, and why?

**Two files that grew instead of being designed.** The day sheet is 1,026 lines and the appointment detail page is 721 lines. Both started in a reasonable way. Every time I added a new feature, I added it to the file where the related thing already existed. The billing tabs went onto the detail page because that is where the appointment was, and the waitlist banner and print button went onto the day sheet for the same reason. I never went back and broke these files into smaller components.

**Second: I have one real test file.** The status machine is covered properly,
because those rules are the ones I would be most embarrassed to get wrong. The
permission rules — which matter more, because a bug there means one doctor
seeing another's patients — are covered by me clicking around in a browser. So
are the waitlist placement rules, which are newer and therefore less clicked. It
is not good enough for something holding patient data, and `npm test` in the
backend is still the default npm placeholder that just fails. I left it failing
rather than make it pretend to pass.

**Third: I shipped a demo that double-booked doctors and did not notice.** The
seed script dropped its unconfirmed appointments onto the quarter hours on top
of a diary sitting on the half hours, so a half-hour booking at 14:15 ran
straight through the 14:30 slot. Two patients, one doctor, one moment — the
exact thing the whole app exists to prevent, sitting on the demo day sheet where
anyone opening the link would see it first. It had been there for days. I did
not find it; it was pointed out to me from a screenshot.

What stings is not the bug, it is that I had written the guard against it and
then walked around it. The seed writes with `insertMany`, which never reaches
the service layer where the overlap check lives, and the unique index only
catches two rows starting at the very same instant — never one starting in the
middle of another. Both guards were working exactly as designed and neither one
was in the path. The seed now checks its own output before it writes anything
and refuses to run if any doctor is left with two overlapping appointments. It
is written up properly in [decisions.md](docs/decisions.md).

**Fourth, and smallest: the dashboard has no time limit on it.** The "by
provider" and "by status" counts run over every appointment ever created, every
time someone opens the page. With a few hundred records nobody notices. It gets
slower forever, and it should be capped to a recent window and cached. I knew
this while writing it and shipped it anyway, which is the sort of thing worth
admitting rather than hoping nobody looks.

---

## More detail

| Document | What is in it |
| --- | --- |
| [README.md](README.md) | Full technical reference — setup, environment variables, every API endpoint, deployment, troubleshooting. |
| [docs/plan.md](docs/plan.md) | How the work was broken up, what order, estimates versus reality, what got cut. |
| [docs/architecture.md](docs/architecture.md) | The moving pieces, where each one runs, one request traced end to end, and what I chose not to build. |
| [docs/schema.md](docs/schema.md) | Every collection field by field, the relationships, which rules the database enforces versus the code, and what breaks first at 100x the data. |
| [docs/decisions.md](docs/decisions.md) | Ten decisions where a real alternative existed — including the one I got wrong and reversed, and the double-booking I shipped without noticing. |
| [docs/ai-prompts.md](docs/ai-prompt.md) | How I used AI, what it got right, and the two bugs it confidently produced because I asked the wrong question. |
