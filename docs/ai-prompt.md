# AI prompts

I used AI only for a few specific problems. I did not use it just to write code
faster. For ordinary code, if something is wrong I can normally notice it inside
a minute. The five problems below were different. They were areas where I could
not easily tell if an answer was correct just by reading it, and where being
wrong can stay hidden for a long time: for example, two people clicking at the
same time, a session that works on my machines but not on the reviewer's
machine, or an alert that does not appear when it is actually needed.

Two of the answers turned out to be wrong. In both cases, the code did exactly
what I asked for, but my question was missing an important detail. Those two are
explained in more detail because they taught me how important it is to give the
full context when asking for help.

---

## Making the double-booking guard survive two clicks in the same instant

The service layer already checked for overlaps before writing. I knew that check
was not enough — two requests can both read "nothing there" before either
writes — but I did not know what the fix looked like in MongoDB, and this is the
one rule the whole application exists to enforce. A clinic that double-books is
not a clinic with a bug in it, it is a clinic that does not work.

### Prompt

```
Mongoose. Appointment has providerId, startsAt, endsAt, status (OPEN,
REQUESTED, CONFIRMED, CHECKED_IN, COMPLETED, NO_SHOW, CANCELLED), and
archivedAt which is null unless the row is soft-deleted.

My service checks for an overlapping appointment before it inserts, but two
concurrent requests can both pass that check and both insert. I want the
database itself to refuse the second one. Archived rows should not count —
they are deleted as far as the app is concerned.

What index, and what happens to my code when it fires?
```

### What you got

A unique compound index on `{ providerId: 1, startsAt: 1 }` with a
`partialFilterExpression` of `{ archivedAt: null }`, so archived rows sit
outside the constraint and stop blocking their own time. It also told me the
thing I actually needed and would not have guessed: the driver raises error code
**11000** on the violation, and because that arrives as a write error rather
than an exception my own code throws, it needs catching at the boundary where
writes happen or it surfaces as a 500. That is why `withTransaction()` in
`appointment.service.js` ends with a check for `err.code === 11000` and turns it
into a 409 with a sentence a receptionist can read:

> That provider already has a slot at exactly this time.

It was straight about the limit, too: a unique index on the start time catches
two rows starting at the same instant and nothing else. One appointment
beginning in the middle of another is invisible to it. The range query in the
service stays, because it is the only one of the two that can name the slot it
collided with.

### What you corrected

**This was the first of the two wrong answers, and it was wrong because of what
I left out of the question.** I said archived rows should not count. I never
said anything about cancelled ones.

So the index treated a cancelled appointment as still occupying its time. It
shipped like that and worked perfectly until reception cancelled a 14:00 and
tried to give the slot to somebody else — which is not an edge case, it is the
single most ordinary thing that happens on a clinic phone. The refusal was the
409 above, and the message was actively misleading: the provider did **not**
have a slot at that time, they had a cancelled one, and cancelling is precisely
how time is handed back.

The fix is a partial filter on status as well as `archivedAt`, and writing it
turned up a second thing I did not know: **MongoDB rejects `$ne` inside a
`partialFilterExpression`.** The obvious `status: { $ne: 'CANCELLED' }` will not
build. It has to be an explicit `$in` of the statuses that do occupy time, which
is why `Appointment.js` exports

```js
export const TIME_OCCUPYING_STATUSES = STATUSES.filter((s) => s !== 'CANCELLED');
```

and feeds that list to the index rather than expressing the rule as a negation.

The last part of the correction is operational, and I would not have thought of
it in time. Mongoose will not reshape an index that already exists under the
same name — `syncIndexes()` sees `uniq_provider_slot_active` present and moves
on. Every database created before the change keeps the old shape silently, which
means the bug survives the fix. That is what `npm run reindex` and
`src/scripts/reindex.js` are for: drop the index by name, rebuild it, and print
the partial filter before and after so you can see which shape you are on.

---

## Bulk availability that reports what it skipped, and why

`POST /appointments/generate` takes a weekly pattern and a date range and
expands it into slots. The easy half is the expansion. The half I wanted help
with is the promise the endpoint makes: it never writes a clash, and it comes
back naming every slot it did not create and what was in the way. A generator
that silently drops three slots out of forty is worse than one that refuses,
because nobody notices until a Thursday afternoon is empty.

### Prompt

```
Express route. Input is { providerId, from, to, weekdays: [0-6],
blocks: [{ startTime: "HH:MM", durationMin }] }. I expand that into candidate
slots.

Before inserting I need to reject any candidate that overlaps an appointment
this provider already has, AND any candidate that overlaps another candidate
from the same run. I want one query, not one per candidate — a month of five
blocks a day is 100+ candidates.

Return the created ones and the skipped ones with the reason and the row they
clashed with.
```

### What you got

The right shape, and the two ideas I was missing.

The first is to fetch existing appointments **once**, for the whole span the run
covers, with the standard half-open overlap test — `startsAt < rangeEnd` and
`endsAt > rangeStart` — rather than querying per candidate. The second is the
one I would not have arrived at: after a candidate is accepted, push it onto
that same in-memory `existing` array. From then on it is checked against exactly
like a row from the database, so a run cannot collide with itself and there is
still only one query. Fifteen lines, and the whole intra-run problem disappears.

It also suggested the distinction the skipped report makes between
`'A slot already exists at this time'` and `'Collides with an existing booking'`,
which is a small thing that turned out to matter on screen — an open slot in the
way and a booked patient in the way are different news for the person reading
the result panel.

### What you corrected

**The second wrong answer, and again it answered the question I asked.**

For the query window it used the first candidate's `startsAt` and the last
candidate's `endsAt`. That is correct if candidates come out in time order and
all run the same length. I had said neither, because it had not occurred to me
that it mattered — and it is false on both counts. Blocks are in whatever order
they were typed into the form, and each one carries its own duration, so a 09:00
block of 240 minutes finishes later than a 14:00 block of 30. The last candidate
is not reliably the latest finish.

The window therefore came up short at the top end, an existing booking sitting
just past its edge was never fetched, and the candidate that ran into it was
never marked as a skip. It went into `insertMany` instead — where it hit the
unique index from the previous section and threw. Because that insert runs
`{ ordered: false }` and is not wrapped in a transaction, some slots were
written and some were not, and the response was a 500 rather than the skipped
list that is the entire point of the endpoint. A generator that half-wrote a
month and then reported nothing at all.

The correction is two lines, and the reasoning is in the comment above them in
`appointment.service.js`: take the window from every candidate, not from the
ends of the array.

```js
const rangeStart = new Date(Math.min(...candidates.map((c) => c.startsAt.getTime())));
const rangeEnd   = new Date(Math.max(...candidates.map((c) => c.endsAt.getTime())));
```

What I took from this and from the previous one is the same lesson twice. Both
answers were sound for the question. Both questions were missing a fact about my
own data that I knew and did not think to say — cancelling frees time; blocks
are unordered and unequal. The failure was upstream of the model.

---

## Laying overlapping appointments side by side on the day grid

The day sheet draws one column per provider with blocks positioned by time. The
moment two appointments for one provider overlap — which a manually created slot
can do at any time — the later one is drawn on top of the earlier and a patient
disappears off the sheet. Hiding an appointment on the screen the clinic runs
its day from is not a cosmetic bug.

I knew the shape of the answer was an interval-packing problem. I did not want
to get the details wrong at the end of a long day.

### Prompt

```
React. I have appointments with startsAt/endsAt, absolutely positioned in a
column by minutes-from-top. When two overlap they need to sit side by side,
each taking a share of the column width.

Naively giving each block width = 100 / (number of blocks overlapping it) makes
two blocks that overlap each other come out different widths, which looks
broken. What is the correct way to work out the divisor?
```

### What you got

The sweep, and the correction to my own instinct that made it work.

Sort by start time. Walk the list accumulating a **cluster** — appointments that
transitively touch — and close the cluster the moment a start time is at or past
the running maximum end. Within a cluster, deal each appointment into the first
lane whose last end is at or before this start, opening a new lane only when
none is free.

The part I asked for, and the part I would have got wrong: the divisor is a
property of the **cluster**, not of the individual block. Every appointment in a
cluster is drawn against the same lane count, assigned in a second pass once the
cluster is closed and the total is known. That is what stops two blocks
overlapping each other from coming out different widths, and it is why
`packLanes()` in `DayPage.jsx` back-fills the count after `flush()` rather than
setting it as it goes.

### What you corrected

Very little in the algorithm — it is close to what was suggested, and the
comments in the source say why it does what it does.

What I had to add was everything about the blocks being read by a person. Lane
packing solves the geometry and says nothing about whether a fifteen-minute
visit can carry a patient's name. It could not: at the 1.6 pixels per minute I
started with, a quarter-hour block drew 24px tall, and the two stacked lines
inside it needed more than that, so the name was clipped off the bottom of every
short appointment on the sheet. That is not an edge case here — a ten-minute
vaccination is a normal booking.

So the grid went to 2px a minute, and `blockTier()` picks one of four layouts by
the height the block actually got: a single line of `09:00  Jane Doe` under
34px, a stacked time and name under 52px, one spare line for the supporting
doctor under 74px, and the full card with a status badge above that. On the
shortest tier the *time* gives up its width before the name does, because the
block already sits at its own time on the grid and a slot with no name on it is
useless. Whatever a block could not print is on its hover title.

None of that came from the prompt. It came from looking at the result on a real
day sheet.

---

## An alert that has to come back after it was dismissed

An appointment still unconfirmed within 24 hours raises an alert, and the front
desk can dismiss one. The requirement I could not model was the exception:
something waved off yesterday afternoon must **not** stay quiet twenty minutes
before the patient is due. Dismissal has to expire, but only in one direction,
and it has to be obvious on screen that the reappearance is deliberate and not
the dismiss button failing.

I had drafted this as a boolean on the appointment and could not make the rule
come out of it.

### Prompt

```
Appointments raise an alert while status is REQUESTED and startsAt is within
24h. Front desk can dismiss one and it drops off the feed.

The rule I can't express: if it was dismissed while more than an hour out, it
must come BACK when the appointment enters its final hour. If it was dismissed
inside that final hour, it stays gone.

I have a boolean `alertDismissed` on the appointment and I can't write the
condition. Is the flag the problem?
```

### What you got

Yes, the flag was the problem, and the answer was to stop storing the state and
start storing the event. A boolean records *that* it was dismissed. The rule
turns on **when** it was dismissed relative to the appointment's own start time,
and a boolean has thrown that away by the time you need it.

So dismissals became their own collection — `AlertDismissal`, one row per
dismissal, carrying `appointmentId`, who did it, and `dismissedAt` — and the
rule falls out in two comparisons that read like the sentence they came from:

```js
const inFinalHour = appt.startsAt <= finalHour;
const dismissedBeforeFinalHour =
  dismissal.dismissedAt < new Date(appt.startsAt.getTime() - HOUR_MS);

if (inFinalHour && dismissedBeforeFinalHour) {
  items.push({ ...appt, urgent: true, reappeared: true });
}
```

It also flagged the query cost before I hit it: rows are per dismissal, so an
appointment dismissed three times has three, and only the most recent one
decides anything. Hence the single `$in` fetch sorted `dismissedAt: -1` and
reduced into a `Map` that keeps the first entry it sees per appointment — one
round trip, latest wins, no `$group` and no query per row.

### What you corrected

The rule was right. What I added was the `reappeared: true` on the way out, and
that turned out to be the part that mattered most.

Without it the behaviour is indistinguishable from a broken dismiss button. The
receptionist dismissed this exact row an hour ago and here it is again — the
reasonable conclusion is that the software did not save it. So the flag rides
along on the response, `AlertsPage` renders **"back after dismissal"** on the
row, and the README says the same thing in Troubleshooting under a heading that
starts *Dismissed alerts came back* and answers **intended**. Correct behaviour
that looks like a bug is worth about as much as the bug.

I also chose, against the suggestion, not to expire dismissals on any other
schedule. One rule, one hour, stated in one place.

---

## Signed in on Chrome, signed out on Safari

Deployment day, and the worst class of bug there is: it worked on everything I
had. The frontend is on Vercel, the API on Render, two different registrable
domains. Chrome and Firefox were fine. On Safari, `/auth/login` returned 200
with the user object and the very next request came back 401, forever, with no
error anywhere to work from.

This is the one I would not have solved alone. I did not know the mechanism
existed.

### Prompt

```
API and SPA on different domains, cross-site. Session is a JWT in an httpOnly
cookie set by the login response. axios has withCredentials: true, CORS has
credentials: true and the exact frontend origin allowlisted, cookie is
SameSite=None; Secure, both sides are HTTPS.

Chrome and Firefox: fine. Safari: login returns 200 and sets the cookie, and
every request after it is 401. The cookie is not coming back.

Is my configuration wrong, or is Safari doing something I can't configure my
way out of?
```

### What you got

The second one, which was not the answer I wanted and was the answer.

Safari ships with "Prevent cross-site tracking" **on by default**, and its
tracking prevention drops a `SameSite=None` cookie from a different registrable
domain regardless of how the cookie is configured. There is no combination of
`Secure`, `SameSite`, `Domain` or CORS headers that gets it back. The
configuration was correct. It was being correct at a browser that had decided
not to participate.

Two ways out. Put the API behind the site's own domain — a `/api` proxy or an
`api.` subdomain — so the cookie is first-party and the problem does not exist;
or carry the same token somewhere tracking prevention does not reach, which
means the `Authorization` header.

### What you corrected

I took the header route, because moving the API onto the frontend's domain on
Render's free tier on deployment day was not a trade I was willing to make. I
did narrow the suggestion in two ways.

It proposed replacing the cookie with the header. I kept **both**. The cookie is
still the primary carrier and still `httpOnly`, so on the browsers that honour
it no token is ever readable by script on the page — which is the property the
cookie was chosen for, and I was not giving it up for every user to satisfy one
browser. `/auth/login` returns the token in the body *as well*, `lib/api.js`
keeps it under `riverside.token` and attaches it as a bearer header on every
request, and `requireAuth` accepts either. Safari signs in on the header and
everyone else carries on unaffected.

Second, I hardened the storage past what was suggested. Every `localStorage`
read and write sits inside a `try/catch`, because a locked-down private window
throws on the property access itself and not on the call — a detail that would
have turned "Safari cannot sign in" into "Safari cannot load the page". And the
response interceptor clears the token on any 401, so a dead token stops being
presented on every subsequent load.

It is a workaround and it is written up as one, in the README under Deployment
and again in Troubleshooting. The first-party proxy is the real fix, and it is
on the list.

---

