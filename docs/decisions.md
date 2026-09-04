 Decisions
6 decisions where a real alternative existed and I picked one. One of them I later reversed
---

## Decision 1 — One record for both an empty slot and a booked appointment

- **Chose:** A single `appointments` collection. An empty slot is just an
  appointment with `status: OPEN` and no patient attached. Booking it fills in
  the patient and moves the status to `REQUESTED`.
- **Rejected:** Two separate collections — an `availability` table of empty
  slots, and an `appointments` table of real bookings, with booking copying a
  row from one to the other.
- **Why:** With two tables, booking becomes a *move* — delete from one place,
  create in another, and hope both halves happen. That is where double-bookings
  and vanished slots come from. With one record, booking is a single field
  change on a row that already exists, so it either happens or it does not.
  It also means the double-booking guard, the permission rules, the overlap
  check, and the history log all live in one place instead of being written
  twice. The cost is that "status" now carries two different meanings —
  "nobody has booked this" and "somebody booked it and then it progressed" —
  which takes a moment to explain to a newcomer. Worth it.

---

## Decision 2 — Login lives in an httpOnly cookie, not in localStorage

- **Chose:** A signed JWT stored in an `httpOnly` cookie that the browser sends
  automatically. The React code sets `withCredentials: true` and otherwise never
  thinks about it.
- **Rejected:** Returning the token in the response body and storing it in
  `localStorage`, then attaching it to every request with an
  `Authorization: Bearer ...` header — which is the more common tutorial
  approach.
- **Why:** `localStorage` is readable by any JavaScript on the page. One bad
  dependency, one injected script, and the token walks out the door. An
  `httpOnly` cookie is invisible to JavaScript entirely, so there is nothing to
  steal that way. It also makes "stay logged in after refresh" free — the cookie
  is already there, so the app just asks `/auth/me` on boot and gets its user
  back, with no token-juggling code at all.

  The cost is real and I paid it: cross-domain cookies need
  `SameSite=None; Secure`, which forces HTTPS on both sides in production and
  means the API must keep an exact allowlist of frontend addresses. Most of the
  Saturday-morning deploy pain came from this one decision. I would still make
  it again — patient data is exactly the kind of thing that should not sit in
  `localStorage`.

---
## Decision 3 — The waitlist places nobody by itself

- **Chose:** When a slot frees up, nothing happens automatically. Reception
  opens the waiting patient, sees the open slots that actually fit their window,
  and gives them one.
- **Rejected:** Watching for cancellations and booking the first person in the
  queue into the freed slot, then telling them.
- **Why:** The data is all there to do it automatically, which is exactly what
  makes it tempting. But a waitlist entry is somebody who rang on Monday saying
  they could come in this week. By Thursday they may have been seen elsewhere,
  or gone to work, or forgotten. Booking an appointment they never agreed to is
  worse than leaving the slot empty: they do not turn up, the slot is wasted
  anyway, and now the record says they were a no-show — which follows them
  around and is not true.

  So the software's job stops at putting the right names next to the right
  slots. A person makes the call, and the booking happens when somebody has said
  yes. The one thing I did automate is the noticing: the day sheet shows a
  banner when people are waiting for the day being looked at, because spotting
  the gap and remembering the list are two different things and only one of them
  is a computer's job.

---

## Decision 4 — Clinical and billing notes share one collection

- **Chose:** One `visitnotes` collection with a `kind` field of `CLINICAL` or
  `BILLING`, split apart everywhere it is read.
- **Rejected:** A separate `billingnotes` collection.
- **Why:** They are genuinely the same shape. Both are a piece of text attached
  to one appointment, written by one member of staff at one moment, editable
  only by whoever wrote it. A second collection would have meant a second model,
  a second set of routes, a second permission check and a second edit path, to
  store two extra fields.

  What is different is not the shape, it is *who is allowed to write in each* —
  and that is a rule, not a schema. A provider on the appointment writes the
  clinical note; the front desk writes the billing one; neither can write in the
  other's column. Rules like that belong in the service layer, where all the
  other rules in this app already are, and where the error message can be a
  sentence rather than a constraint violation.

  The cost is that every read has to remember to filter by `kind`. Forget it in
  one place and reception sees a doctor's clinical note in the billing tab. I
  handled it by splitting once, at the top of the page, rather than filtering at
  each use — but it is a real sharp edge and worth naming.
---
## Decision 5 — Whether a cancelled appointment keeps holding its slot

- **Chose (originally):** The unique index covered **every** non-archived
  appointment, cancelled ones included. One slot per provider per start time,
  full stop.
- **Rejected (originally):** Excluding cancelled appointments from the index.
- **Why (originally):** It was simpler and, on paper, stricter. The index
  condition was one clause instead of a list, and "never two records for the
  same doctor at the same minute" sounded like the safest possible rule.

- **Later reversed.** It was wrong, and testing it as a receptionist rather than
  as a developer is what showed it.

  Here is the sequence that broke it. Reception books the 10:00 slot with
  Dr Patel. The patient rings at 10:00 to cancel. Reception cancels it — the
  record is now `CANCELLED`, and 10:00 is genuinely free. Another patient rings
  wanting 10:00. Reception tries to create the slot and the system refuses:
  *"That provider already has a slot at exactly this time."* The doctor is
  standing there with an empty ten o'clock and the computer is insisting she is busy.

  I had confused two different things. "Two records exist for that minute" is a
  *data* concern. "The doctor is not available then" is a *clinic* concern. The
  index was enforcing the first while pretending to enforce the second, and a
  cancelled appointment is precisely the case where they disagree.

  **What changed:** the index became a *partial* index, filtered to statuses
  that actually occupy time — everything except `CANCELLED`. There is a small
  MongoDB wrinkle here: partial filters do not accept "not equal to", so it is
  written out as an explicit list of the six statuses that do hold a slot.

  The awkward part was the fix in production. Mongoose will not reshape an index
  that already exists under the same name — it looks at the name, sees it there,
  and leaves it alone. So the change is silently ignored on any database that
  already has the old index. I had to write a
  [`reindex` script](../backend/src/scripts/reindex.js) that explicitly drops
  the old index and rebuilds it, and it has to be run once per database. That
  script exists purely because of this reversal, and the README says so.

  **What I actually learned:** I wrote the constraint by thinking about the data
  shape rather than about a person standing at a desk. Almost every rule in this
  app that turned out to be wrong was wrong in that same way.

---



## Decision 6 — Every write runs inside a transaction

- **Chose:** Wrap each write in a MongoDB transaction, so the change to the
  appointment and the entry in the history log commit together or not at all.
- **Rejected:** Write the appointment, then write the history entry, and accept
  that very occasionally one might land without the other.
- **Why:** The audit trail is one of the main reasons this app exists. A history
  log that is *usually* right is worse than no log, because people trust it.
  Without a transaction there is a real window where the status changes and the
  server dies before the log entry is written — leaving an appointment that was
  cancelled by nobody, at no time, for no reason.

  The price is a genuine constraint on deployment: MongoDB only allows
  transactions on a **replica set**, so a plain single local `mongod` will not
  run this app. Anyone setting it up locally either uses Atlas or starts Mongo
  with `--replSet`. That is a real barrier for a new developer, and I accepted
  it knowingly. It is documented in the README's troubleshooting section because
  the error message MongoDB gives is not obvious.

---
