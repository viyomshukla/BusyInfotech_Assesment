# Plan

## How did I break the work into sessions?

I worked in four sittings across three days to get the brief done, then a fifth
block the following week for the three extras. Each sitting had one job, so I
never had two half-finished things open at once.

**Session 1 — Saturday afternoon (29 Aug, ~16:00–17:00).** The backend skeleton.
Users, patients, login, and the rules that decide who is allowed to do what.
Then the appointment engine itself: overlap detection, the status rules, and the
history log. Three commits, all backend, no screens at all.

**Session 2 — Sunday morning (30 Aug, ~11:00–12:40).** The whole frontend in one
go. Login, dashboard, day sheet, appointment list, appointment detail, alerts,
availability, staff. This was the longest session by a distance, and it ended
with two clean-up commits ("improve ui", "Fix Alert") because building all the
screens revealed things the API was returning in an awkward shape.

**Session 3 — Monday morning (31 Aug, ~11:00–12:40).** Bug-fixing and getting
it ready to deploy. The CSV export, a date bug, removing `.env` and
`node_modules` from git (they should never have been committed), making CORS
accept more than one address, and making login errors say what actually went
wrong.

**Session 4 — Tuesday evening (1 sept 20:00).** Writing
the README, then one last pass to make every waiting state in the app look and
behave the same way.

**Session 5 — the following week (2–4 Sep).** Three things off the brief's "out
of scope" list, in the order a front desk would miss them: the waitlist, the
printed day sheet, and splitting visit notes into clinical and billing. Then two
fixes that came out of actually looking at the result — short appointments were
having the patient's name clipped off the bottom of the block, and the seed had
been quietly double-booking doctors. The second one is the reason there is now a
check inside the seed script itself.

## What order did I build in, and why that order?

**Backend first, frontend second.** The whole point of this app is rules — a
slot can't be double-booked, a provider can't see someone else's patients, you
can't mark a no-show for an appointment that hasn't happened yet. If I had built
pretty screens first, I'd have discovered those rules late and had to redo the
screens. Rules first meant the screens were mostly just plumbing.

Inside the backend I went:

1. **Who are you** — the `User` model, password hashing, login, and the cookie.
   Nothing else can be built until the app knows who is asking.
2. **The one hard thing** — the appointment service. Overlap checks, the status
   machine, and the audit log all landed together because they only make sense
   together: every status change has to write a history entry, and both have to
   succeed or neither should.
3. **The extras** — visit notes and care teams. These sit on top of the
   appointment and needed the permission rules to already exist.

Then the frontend, roughly in the order a real user meets it: login → dashboard
→ day sheet → list → detail → alerts → admin pages.

I deliberately did the **hardest screen last**. The appointment detail page does
ten different things (book, reschedule, cancel with a reason, change status,
reassign, care team, clinical notes, billing notes, editing either, and the
timeline). By the time I got there I had already built every small piece it
needed. It was 524 lines then and it is 721 now, which is the whole problem with
it in one sentence — every new capability went into the file where the
appointment already lived, and it never got broken up afterwards.

## What did I estimate versus what it actually took?

| Piece | I guessed | It took | What happened |
| --- | --- | --- | --- |
| Backend models + auth | 2 h | ~2 h | Went to plan. |
| Appointment engine | 3 h | ~4 h | The overlap-in-a-race problem cost an extra hour I hadn't budgeted. |
| All frontend screens | 4 h | ~6 h | Badly underestimated. Seven screens is seven sets of loading states, empty states, and error states. |
| Alerts | 1 h | ~2 h | The "a dismissed alert should come back" rule is fiddlier than it sounds. |
| Deploy config + bug fixes | 1 h | ~2 h | CORS and cookies across two different domains ate most of it. |
| README + docs | 1 h | ~2 h | |
| **Brief subtotal** | **~12 h** | **~18 h** | |
| Waitlist | 2 h | ~3 h | The model and the API were quick. Working out that placement should never be automatic, and what the screen does when a patient's window has already gone by, was the rest. |
| Printed day sheet | 1 h | ~1 h | Went to plan, because I stopped trying to restyle the existing page and gave it its own. |
| Clinical / billing note split | 1 h | ~1.5 h | The schema change is small. Getting the permissions the right way round — providers write one column, reception the other, neither writes both — took the rest. |
| Day sheet block sizes | 0.5 h | ~1 h | |
| The seed double-booking | 0 h | ~1.5 h | Not budgeted, because I did not know it was there. |
| **Total** | **~16.5 h** | **~26 h** | |

The pattern is obvious in hindsight: I estimated the *happy path* every time.
The extra hours were almost entirely the unhappy paths — what the screen shows
while it's loading, what it shows when there's nothing there, what it says when
the server refuses, and what happens when a patient's window has already passed.
The one line in that table I could not have estimated is the last one, and it is
the one I would most like to have back.

## What did I cut when I ran short?



**A patient directory.** Patients get created on the fly when the front desk
types a walk-in name. There is no screen to browse, search, edit, or merge
patients, so two people typing "Asha Rao" and "asha rao" create two records.
Real clinics need that screen. This one doesn't have it.

**Reschedule after booking.** You can move a slot while it is still `OPEN`, but
once a patient is in it the only route is cancel-and-rebook. That's a real
workflow gap, not a technical limit — I just ran out of time to design the
screen for it.

**Email and SMS reminders, and the overnight digest.** The alerts queue and the
waitlist both tell staff who to chase, but the chasing is a phone call made by a
person. Nothing leaves this system on its own. This one is not really a
time problem — I have no mail or SMS account to send through, and building a
screen that shows what *would* have been sent is a lot of work for something
that never actually sends.

**Recurring appointments and room assignment.** Two more off the brief's out-of-
scope list. Both are real features with real design questions in them — "edit
this occurrence or all of them" is a whole conversation on its own — and I would
rather have three extras finished than five half-done.

**Patient self-service booking.** Not a feature, a second application. Public
sign-up, a third role, rate limiting, and re-auditing every existing endpoint to
be certain one patient cannot read another's record. Attaching that to a staff
tool in a hurry is how patient data ends up somewhere it should not be.

**Pagination on the day sheet.** It asks for up to 100 appointments for one day
and renders them all. Fine for three providers at six slots a day; it would need
rethinking at thirty providers.
