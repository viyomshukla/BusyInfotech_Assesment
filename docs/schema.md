# Schema

The database is MongoDB, so strictly these are *collections*, not tables — but
they behave like tables here because Mongoose enforces a fixed shape on every
one of them. Seven collections in total.

## Table by table: what columns and types?

### `users` — the staff who log in

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Auto. |
| `email` | String | **Unique.** Forced to lowercase and trimmed, so `Desk@Clinic.test` and `desk@clinic.test` are the same person. |
| `passwordHash` | String | A bcrypt hash. The real password is never stored anywhere. |
| `name` | String | Shown in the sidebar, on appointments, and in the history log. |
| `role` | String | Only `FRONT_DESK` or `PROVIDER`. Anything else is rejected. |
| `createdAt` / `updatedAt` | Date | Automatic. |

One safety rail worth pointing out: the model has a `toJSON` rule that **strips
`passwordHash` out of any response**. Even if a careless route sent the whole
user object back to the browser, the hash cannot go with it.

### `patients` — the people being seen

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Auto. |
| `name` | String | Required. |
| `phone` | String | Optional. |
| `email` | String | Optional, lowercased. |
| `createdAt` / `updatedAt` | Date | Automatic. |

Deliberately thin. Patients get created on the fly when reception books a
walk-in by name.

### `appointments` — the centre of the whole system

One record is **both** an empty slot in a diary **and**, once someone is booked
into it, the appointment itself.

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | ObjectId | Auto. |
| `providerId` | ObjectId → `users` | The doctor whose diary this is. |
| `providerName` | String | A **copy** of that doctor's name. See "denormalised" below. |
| `patientId` | ObjectId → `patients` | `null` while the slot is still open. |
| `patientName` | String | A copy of the patient's name. `null` while open. |
| `startsAt` | Date | When it starts. |
| `endsAt` | Date | Always start + duration. Never set independently. |
| `durationMin` | Number | Minimum 5, maximum 480 (eight hours). |
| `status` | String | One of seven: `OPEN`, `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `NO_SHOW`, `CANCELLED`. |
| `cancelReason` | String | Only set on cancellation, and never empty when it is. |
| `cancelledAt` | Date | Set at the same moment as the reason. |
| `archivedAt` | Date | The soft delete. `null` normally; a timestamp when hidden. |
| `careTeam[]` | Array | Supporting doctors. Each entry: `providerId`, `assignedBy`, `assignedAt`. |
| `createdAt` / `updatedAt` | Date | Automatic. |

### `appointmentevents` — the history log

Append-only. Nothing in this collection is ever edited or removed.

| Field | Type | Notes |
| --- | --- | --- |
| `appointmentId` | ObjectId → `appointments` | Which appointment this is about. |
| `actorId` | ObjectId → `users` | Who did it. |
| `actorName` | String | Their name, copied at the time. |
| `type` | String | `CREATED`, `STATUS_CHANGED`, `CANCELLED`, `PROVIDER_REASSIGNED`, `SUPPORT_ADDED`, `SUPPORT_REMOVED`, `NOTE_ADDED`, `ARCHIVED`, `RESTORED`. |
| `fromStatus` / `toStatus` | String | Where it moved from and to. |
| `detail` | Mixed | Free-form extras — the cancel reason, the old and new provider, the note id. |
| `createdAt` | Date | Marked `immutable`, so Mongoose refuses to change it. |

### `visitnotes` — what happened, and what it costs

| Field | Type | Notes |
| --- | --- | --- |
| `appointmentId` | ObjectId → `appointments` | |
| `authorId` | ObjectId → `users` | A provider on a clinical note, the front desk on a billing one. |
| `authorName` | String | Copied at write time. |
| `body` | String | Up to 5000 characters. |
| `kind` | String | `CLINICAL` or `BILLING`. Defaults to clinical. |
| `code` | String | Billing only. `null` otherwise. |
| `amount` | Number | Billing only. `null` otherwise. |
| `createdAt` / `updatedAt` | Date | Automatic. |

Two different records live here, written by opposite ends of the clinic for two
different readers. A clinical note is the doctor's account of the visit; a
billing note is reception's account of what it costs. They share a collection
because they share an author, a timestamp and an appointment, and they are split
by `kind` everywhere they are read, so neither turns up where the other belongs.

Who may write which follows the same split, and it is enforced on the server:
clinical notes are for providers who are actually on the appointment, billing
notes are front desk only, and neither role can write in the other's column.
Either way only the author can edit their own. A note written before the split
existed has no `kind` and is read as clinical, because clinical is the only
thing that existed when it was written.

### `alertdismissals` — "I have already dealt with this one"

| Field | Type | Notes |
| --- | --- | --- |
| `appointmentId` | ObjectId → `appointments` | |
| `dismissedBy` | ObjectId → `users` | |
| `dismissedByName` | String | |
| `dismissedAt` | Date | Defaults to now. |

This is a **history of dismissals**, not a flag on the appointment. That is a
deliberate choice and it is what makes the "dismissed alert comes back" rule
possible — see [decisions.md](decisions.md).

### `waitlistentries` — people waiting for a day that is full

| Field | Type | Notes |
| --- | --- | --- |
| `patientName` | String | Required. |
| `phone` | String | Optional, same ten-digit rule as `patients`. How reception rings them back. |
| `providerId` | ObjectId → `users` | `null` means any doctor will do, which is the answer that gets them seen soonest. |
| `providerName` | String | Copied, `null` alongside a null `providerId`. |
| `preferredFrom` / `preferredTo` | Date | The window they can actually come in, stored as local day bounds so a slot anywhere on the last day still counts as inside it. |
| `status` | String | `WAITING`, `PLACED` or `REMOVED`. |
| `placedAppointmentId` | ObjectId → `appointments` | The slot they were eventually given. `null` until then. |
| `placedAt` / `removedAt` | Date | Whichever applies. |
| `note` | String | Anything reception needs when they ring back — "mornings only", "can come at an hour's notice". |
| `addedById` / `addedByName` | ObjectId → `users` / String | Who took the call. |
| `createdAt` / `updatedAt` | Date | Automatic. `createdAt` is what orders the queue. |

**No patient record is created here**, and that is on purpose — see
[architecture.md](architecture.md). The entry holds a name and a number; the
`Patient` gets created at the moment somebody is actually placed into a slot.

Nothing here is deleted either. Taking somebody off the list sets `REMOVED`, so
the clinic keeps a record of who asked and what happened to them.

Indexed on `{ status, preferredFrom, preferredTo }` and `{ status, providerId }`
— the two questions the day sheet asks when it finds an open slot: *is anyone
waiting for this day*, and *would they take this doctor*.

## Which relationships are one-to-many, and which are many-to-many?

**One-to-many** (one thing on the left, many on the right):

| One | Many | Meaning |
| --- | --- | --- |
| User (provider) | Appointments | A doctor has many appointments in their diary. |
| Patient | Appointments | A patient has many visits over time. |
| Appointment | Appointment events | Every appointment collects a stream of history entries. |
| Appointment | Visit notes | Several providers can each leave a note on one visit. |
| Appointment | Alert dismissals | The same alert can be dismissed more than once over its life. |
| User | Visit notes | A doctor writes many notes. |
| User (provider) | Waitlist entries | Several people can be waiting for the same doctor. The link is optional — an entry with no doctor means "anyone". |
| Appointment | Waitlist entry | At most one, and only after a placement. The entry points at the appointment it turned into. |

**Many-to-many** — there is exactly one, and it is the **care team**. An
appointment can have several supporting providers, and a provider can be on the
care team of many appointments. Instead of a separate join table, it lives as an
array embedded inside the appointment document.

That is a MongoDB-flavoured choice. It works here because the array is tiny —
realistically two or three people — and because it is *always* read together
with its appointment and never on its own. In a SQL database this would have
been an `appointment_care_team` join table.

## Which constraints does the database enforce, and which does the code?

**Enforced by the database itself** (the last line of defence — no code can slip
past these):

1. **Unique email.** A unique index on `users.email`. Two accounts cannot share
   an address, whatever the code does.
2. **No two live slots at the same instant for the same doctor.** A *unique
   partial index* named `uniq_provider_slot_active` on
   `{ providerId, startsAt }`. "Partial" means it only applies to rows that are
   not archived and not cancelled — so a cancelled appointment frees its time
   for someone else, which is what a real clinic expects.
3. **Every required field is present, and every status is a real status.**
   Mongoose enforces `required` and `enum` before anything reaches the database.
4. **`durationMin` is at least 5.** A schema-level minimum.
5. **The history log cannot be rewritten.** The event model registers hooks on
   every update and delete operation that simply throw
   `"Appointment events are append-only"`. You cannot edit history through the
   normal code paths even by accident.

**Enforced by application code** (in `services/`):

1. **The status machine** — which status may follow which, that a no-show cannot
   be marked before the appointment's time has passed, that cancelling needs a
   written reason, that a checked-in patient cannot be cancelled.
2. **Overlap detection.** Not just "same start time" but "these two time ranges
   touch at all" — a 60-minute slot at 09:00 clashes with a 30-minute slot at
   09:30.
3. **All the permission rules.** Who may see whose appointments, who may
   generate availability in bulk, who may write which kind of note, who may edit
   which note, and that the waitlist is reception's alone.
4. **Care-team rules.** You cannot add the scheduling provider to their own care
   team, or add the same person twice.
5. **Waitlist placement.** Four conditions, all checked at the moment somebody
   is placed rather than when the list was drawn: the slot is still open, it is
   inside the window the patient gave, it is with the doctor they asked for if
   they asked for one, and it has not already started. That last one matters
   more than it sounds — the list of open slots on screen is always a few
   seconds old, and you are ringing somebody to ask them to come in.

**Where did I draw the line, and why?**

The rule I used: **the database enforces facts, the code enforces judgement.**

"No two accounts share an email address" is a fact — it is true regardless of
who is asking or what they intended. Facts belong in the database, because that
is the only place nothing can bypass.

"You cannot cancel a patient who has already checked in" is a judgement about
how this clinic works. It needs to produce a sentence a receptionist can read
and understand, it will change when the clinic's policy changes, and I want to
be able to test it in half a second with no database running at all — which is
exactly what
[`statusMachine.test.mjs`](../backend/src/services/statusMachine.test.mjs)
does.

**The one place I did both on purpose:** double-booking. The code checks for an
overlap *first*, because it can then say something useful — *"that time overlaps
an existing slot starting at 09:30"*. But if two people click "book" in the same
half-second, both requests can pass that check before either one writes. So the
unique index sits underneath as a backstop and one of the two writes simply
fails. The code catches that failure (`error code 11000`) and turns it into a
readable message rather than a crash. Nice message for the common case, hard
guarantee for the rare one.

## What did I deliberately denormalise?

Denormalising means **keeping a copy of something instead of looking it up every
time**. I did it in three places, all for the same reason: speed and simplicity
of reading.

**1. `providerName` on every appointment.** The doctor's name is already in the
`users` collection. Copying it onto the appointment means the appointment list,
the day sheet, and the CSV export can be rendered from one query with no join at
all. When an appointment is reassigned to a different doctor, the code updates
*both* `providerId` and `providerName` together, and writes the before-and-after
pair into the history log.

**2. `patientName` on every appointment.** Same reason, plus one extra: the
patient-name search box searches this field directly instead of searching
patients and then finding their appointments.

**3. `actorName` on every history entry, and `authorName` on every visit note.**
This one is not about speed — it is on purpose for a *different* reason. The
history log should say what was true **at the time**. If Dr Patel later changes
her name, the entry from March should still read as it did in March. A live
lookup would quietly rewrite history. A copy does not.

**The trade-off, honestly stated:** if a provider's name is corrected in the
`users` collection, their existing appointments keep the old spelling until they
are touched again. There is no "rename everywhere" job. For a clinic where names
essentially never change, that is a good trade. For a system where they do, it
would be a bug waiting to happen.

## What would break first at 100x the data?

Today: 4 providers, ~1,400 appointments. At 100x — say 400 providers and 140,000
appointments — here is what breaks, in the order it would break.

**1. The patient-name search. This goes first.** The list endpoint searches with
a case-insensitive regular expression: `{ $regex: 'rao', $options: 'i' }`. A
regex that is not anchored to the start of the string **cannot use an index** —
MongoDB has to read and test every single appointment. At 140,000 rows every
search becomes a full scan. There is already a text index on `patientName` in
the model, but the query does not use it, because a text index matches whole
words and would not find "Rao" from a search for "ra". The fix is to switch to
the text index and accept whole-word search, or move to Atlas Search.

**2. The dashboard.** It is one big `$facet` aggregation with seven branches,
and it runs over **every non-archived appointment, every time the page loads**,
with no date ceiling. The "by provider" and "by status" counts have no time
limit at all, so they get slower forever — every appointment ever booked is
counted again on every page load. The fix is to cap the window (say, the last 90
days) and cache the result for a minute.

**3. The day sheet, and the printed version of it.** It asks for up to 100
appointments for a single day and draws every one of them into a time grid, one
column per provider. With 400 providers that is 400 columns and far past 100
appointments in a day — both wrong (silently truncated at 100) and unusable (a
grid nobody can read). It needs paging by provider. The printed sheet shares the
same ceiling; it at least says so on screen when it has been truncated, which is
the least it can do, but printing an incomplete day sheet is worse than most
truncation bugs because nobody rereads the paper against the screen.

**4. The bulk availability generator.** For each candidate slot it scans an
in-memory list of existing appointments to look for a clash. That is
candidates × existing comparisons. The 500-slot cap keeps it survivable today,
but on a diary that is already dense the inner list grows and it slows down
noticeably.

**5. Sorting the appointment list by status or provider name.** There are
indexes on `providerId + startsAt` and `status + startsAt`, but the code sorts
by `providerName` (the copied string) and adds `startsAt` as a tiebreaker — a
combination nothing indexes. MongoDB would do an in-memory sort, and past 32 MB
of results it refuses outright.

**What would *not* break:** anything that looks one appointment up by its id,
loads its timeline, or lists a provider's own diary. Those all sit on indexes
that match the query exactly, and they would be just as fast at 100x.
