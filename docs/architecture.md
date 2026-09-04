# Architecture

## What are the moving pieces, and how do they talk to each other?

There are three pieces

```
   Browser                    API server                   Database
+--------------+          +------------------+        +--------------+
|  React app   |  HTTPS   |   Express app    |        |   MongoDB    |
|  (Vercel)    |  ----->  |    (Render)      |  --->  |   (Atlas)    |
|              |  JSON +  |                  |        |              |
|              |  <-----  |                  |  <---  |              |
+--------------+  cookie  +------------------+        +--------------+
```

**1. The React app** — Everything the user sees. There are nine screens in total. One of them is the printable day sheet, which deliberately sits outside the app's normal frame. The sidebar and toolbar are not included because they should not appear on the printed page, and the cleanest way to handle that is to not render them at all when printing.

The app itself does not contain the main business rules. If a button is hidden from a user, the server also checks the same permission and refuses the action if the user is not allowed to do it.

**2. The Express API** — the only piece that is allowed to make decisions. It checks who you are, checks whether your role permits what you asked for, applies the clinic's rules, writes to the database, and writes a history entry for anything it changed.

**3. MongoDB** — where everything is stored. Seven collections: users, patients, appointments, visit notes, alert dismissals, waitlist entries, and the appointment history log.

**How they actually talk.** The browser sends normal HTTP requests to
`https://<api>/api/...`. Every one of them carries a small cookie called
`token`. That cookie is the login. The React code never reads it, never stores
it, never touches it — it is marked `httpOnly`, so browser JavaScript literally
cannot see it. All the frontend does is set `withCredentials: true` on its HTTP client, and the browser attaches the cookie automatically.

The plain-English version: **the browser gets a wristband when it signs in, and shows it at the door on every request. The bouncer at the door is the API.**

Two details matter because the two halves live on different domains:

- The API keeps an **allowlist of web addresses** it will accept requests from
  (`CLIENT_ORIGIN`). Anything not on the list is refused.
- In production the cookie is marked `Secure; SameSite=None`, which is the only
  way a browser will send a cookie from `vercel.app` across to `onrender.com`.
  This is why both sides must be HTTPS in production.

## Where does each piece run?

| Piece | Where it lives | Why there |
| --- | --- | --- |
| React app | **Vercel** | After the build it is just static files. Vercel serves them from a CDN and needs zero configuration for a Vite project. |
| Express API | **Render** | It is a long-running Node process, which Vercel is not built for. [render.yaml](../render.yaml) at the repo root is the whole deploy config. |
| MongoDB | **MongoDB Atlas** | Every write in this app runs inside a transaction, and MongoDB only allows transactions on a *replica set*. Atlas gives you one on the free tier; a plain local `mongod` does not. |

In development all three run on my laptop — the React app on port 5173, the API on 5000, and Mongo either as a local single-node replica set or pointed at the same Atlas cluster.

Two things about free tiers, worth knowing before clicking the demo link:

- **Render's free plan sleeps.** After about 15 minutes with no traffic the API shuts down. The next request wakes it, which takes 30–60 seconds. The first login after a quiet period feels broken. It is not; it is just cold.
- `VITE_API_URL` is **baked into the frontend at build time**, not read at
  runtime. Change the API address and the frontend must be rebuilt and
  redeployed.

## What is the request path for one user action, end to end?

Let's follow **"the front desk cancels an appointment because the patient rang to say they can't make it."**

1. **Click.** Reception opens the appointment, hits *Cancel*, and a box appears asking for a reason. The button stays disabled until they type one — the form will not even let them try without it.

2. **The request.** The React app sends
   `POST /api/appointments/<id>/status` with the body
   `{ "to": "CANCELLED", "reason": "Patient rang, unwell" }`.
   The cookie rides along automatically.

3. **Who are you?** `requireAuth` reads the cookie, verifies its signature, and looks the user up in the database. No valid cookie, or a user who no longer exists, gets a `401` and nothing else happens.

4. **Is the request even well-formed?** A Zod schema checks that `to` is one of the seven real statuses and that `reason` is a string. Garbage in the body  gets a `400` listing exactly which fields were wrong.

5. **Are you allowed?** The service checks the role. Front desk may touch any appointment; a provider may touch only their own. Anyone else's gets `403`.

6. **Do the clinic's rules permit it?** This is the interesting step. The status
   machine asks:
   - Is `CANCELLED` reachable from where this appointment is right now? If the patient already checked in, no — and the error says *why*, in a sentence  written for a human: *"This appointment can no longer be cancelled — the
     patient has already checked in."*
   - Is there a real reason string? Empty gets refused.
   - Any refusal here is a `422`, which means "I understood you perfectly, but the clinic's rules say no."

7. **Write it — both parts or neither.** A **transaction** opens. Two things happen inside it: the appointment's status becomes `CANCELLED` with the reason and a timestamp, and a new row is appended to the history log saying *who* cancelled it, *when*, *from* which status, and *why*. If either write fails, both roll back. You can never end up with a cancelled appointment that has no record of who cancelled it.

8. **The reply.** The updated appointment comes back as JSON.

9. **Everything catches up.** On success the React app marks four caches as
   stale: this appointment, the appointment list, the dashboard, and the alerts
   feed. React Query silently refetches whichever of those are on screen. So the
   dashboard counts drop by one and the red badge in the sidebar updates without
   anyone writing a line of code to make that happen.

10. **What reception sees.** The status badge flips to grey "Cancelled", the
    reason appears under it, and a new line appears at the bottom of the
    timeline: *"Front Desk cancelled — Patient rang, unwell — 2 minutes ago."*

If step 6 had refused, the exact sentence the server wrote appears in red above
the form. The API's wording *is* the user-facing wording — there is no second
set of error messages in the frontend that could drift out of sync with the
first.

## What did I decide *not* to build, and why?

**Public sign-up.** There is no "create an account" page. `POST /auth/register` requires you to already be signed in as the front desk. This is a staff tool for one clinic, and anyone who can create their own account can see patients' names annd appointment times. The first account comes from the seed script; every other account is created by reception from inside the app.



**Automatic waitlist placement.** When a slot frees up, nothing books the first person in the queue into it. It is tempting — the data is all there — and it is wrong. Somebody who put their name down on Monday may have made other plans by Thursday, and a booking they never agreed to is worse than no booking: they do not turn up, the slot is wasted anyway, and now the record says they were a no-show. So the software's job stops at putting the right names next to the right slots. A person rings and asks, and then places them.

**A waitlist patient record.** A waitlist entry holds a name and a phone number, not a `Patient`. Most entries never become a visit, and a patients collection full of half-records created by hopeful phone calls is worse than no waitlist at
all — every one of them would show up in the patient search forever. The `Patient` is created at the moment somebody is actually placed, by the ordinary booking path.


**Server-side rendering / Next.js.** Every page is behind a login, so there is nothing to show a search engine and nothing worth rendering before we know who is asking. A plain single-page app is simpler and deploys as static files.

**Hard deletes.** Nothing in this app is ever truly deleted. Archiving sets a timestamp and the row stays. A clinic record that vanishes is worse than a clinic record that is merely hidden.
