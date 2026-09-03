import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import Appointment from '../models/Appointment.js';
import AppointmentEvent from '../models/AppointmentEvent.js';
import VisitNote from '../models/VisitNote.js';
import AlertDismissal from '../models/AlertDismissal.js';
import WaitlistEntry from '../models/WaitlistEntry.js';

const NAMES = [
  'Asha Rao', 'Vikram Shah', 'Meera Nair', 'Rohit Verma', 'Sana Khan',
  'Arjun Menon', 'Priya Das', 'Kabir Joshi', 'Neha Pillai', 'Imran Sheikh',
  'Divya Kulkarni', 'Aditya Bose', 'Farah Qureshi', 'Nikhil Reddy', 'Tara Mehta',
  'Sameer Chatterjee', 'Anjali Gupta', 'Rahul Iyengar', 'Zoya Ansari', 'Karan Malhotra',
  'Ishita Banerjee', 'Manav Deshpande', 'Ritu Saxena', 'Yusuf Merchant', 'Pooja Bhatt',
  'Siddharth Rane', 'Lakshmi Subramanian', 'Devendra Tiwari', 'Ayesha Siddiqui', 'Gaurav Chauhan',
  'Nandini Kapoor', 'Harish Patil', 'Simran Kaur', 'Aniket Ghosh', 'Reshma Dsouza',
  'Varun Trivedi', 'Kavya Hegde', 'Suresh Balan', 'Fatima Rizvi', 'Prateek Sharma',
];

// The last day the schedule is built out to. The clinic publishes its diary to
// the end of September, so the seed fills every working day up to that date.
const HORIZON = { month: 8, day: 30 }; // month is 0-based: 8 = September
const DAYS_BEHIND = 21;

// Weekdays run a full list; Saturday is a morning clinic only; Sunday is shut.
const WEEKDAY_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30',
];
const SATURDAY_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];

const PAST_MIX = [
  'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED',
  'COMPLETED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'OPEN',
];

const FUTURE_MIX = [
  'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'REQUESTED', 'REQUESTED',
  'OPEN', 'OPEN', 'OPEN', 'CANCELLED', 'CONFIRMED',
];

// Today's sheet is the one people look at first, so it gets a spread that
// actually shows the workflow: someone in the room, someone finished, someone
// still to arrive.
const TODAY_MIX = [
  'COMPLETED', 'COMPLETED', 'CHECKED_IN', 'CHECKED_IN', 'CONFIRMED',
  'CONFIRMED', 'REQUESTED', 'OPEN', 'CONFIRMED', 'CONFIRMED',
];

const CANCEL_REASONS = [
  'Patient rescheduled',
  'Patient called to cancel',
  'Provider called away',
  'Clashed with a hospital appointment',
];

// Every slot in the diary is half an hour, which is what the grid of start
// times below is spaced at. The two have to agree: a longer slot would run
// through the start of the next one and put two patients with one doctor at
// the same time.
const SLOT_MINUTES = 30;

const BILLING_NOTES = [
  { body: 'Consultation fee invoiced. Paid by card at reception.', code: 'CONS-30', amount: 800 },
  { body: 'Follow-up billed at the review rate. Receipt issued to the patient.', code: 'FUP-15', amount: 450 },
  { body: 'Dressing pack charged on top of the visit fee.', code: 'PROC-DR', amount: 1200 },
  { body: 'Insurance claim raised. Balance invoiced once pre-authorisation comes back.', code: 'INS-CLM', amount: 2500 },
  { body: 'Screening bundle billed at the package rate.', code: 'SCR-PKG', amount: 1500 },
];

const NOTE_BODIES = [
  'Reviewed symptoms, no red flags. Continue current medication and review in six weeks.',
  'Blood pressure slightly raised. Repeat reading booked for next visit.',
  'Dressing changed and wound is healing cleanly. Advised to keep it dry for 48 hours.',
  'Discussed physiotherapy plan. Home exercises given, progress to be reviewed next month.',
  'Routine follow-up. Patient reports the pain has settled; discharged from this episode.',
];

// A provider is one person in one room, so two of their appointments can never
// overlap in time. Nothing here goes through the service layer that normally
// enforces that — insertMany writes straight past it, and the unique index only
// catches two rows starting at the very same instant, not one starting in the
// middle of another. So the seed checks its own work before it writes it: a
// demo that opens on a doctor seeing two patients at once is worse than none.
function firstOverlap(rows) {
  const byProvider = new Map();
  for (const row of rows) {
    const key = String(row.providerId);
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key).push(row);
  }

  for (const list of byProvider.values()) {
    list.sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startsAt < list[i - 1].endsAt) return [list[i - 1], list[i]];
    }
  }
  return null;
}

const clock = (d) => `${d.toDateString()} ${d.toTimeString().slice(0, 5)}`;

// A fixed sequence, so two runs of the seed produce the same clinic. A demo
// that reshuffles itself on every deploy is impossible to talk anyone through.
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260930);
const pick = (list) => list[Math.floor(random() * list.length)];

function endOfHorizon(today) {
  const end = new Date(today.getFullYear(), HORIZON.month, HORIZON.day);
  end.setHours(0, 0, 0, 0);
  // Run the seed in October and the horizon has already gone; four more weeks
  // of diary is more useful than an empty future.
  if (end <= today) return new Date(today.getTime() + 28 * 86400000);
  return end;
}

async function run() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    VisitNote.deleteMany({}),
    AppointmentEvent.collection.deleteMany({}),
    // Dismissals point at appointments that are about to stop existing. Left
    // behind they are orphans, and the alerts view would be quietly reading
    // them on every pass.
    AlertDismissal.deleteMany({}),
    // Same for a waitlist entry that has been placed: it names an appointment
    // that is about to be deleted out from under it.
    WaitlistEntry.deleteMany({}),
  ]);

  const hash = await bcrypt.hash('password123', 10);
  const [desk, patel, singh, iyer, viyom] = await User.create([
    { email: 'desk@clinic.test', passwordHash: hash, name: 'Front Desk', role: 'FRONT_DESK' },
    { email: 'drpatel@clinic.test', passwordHash: hash, name: 'Dr Patel', role: 'PROVIDER' },
    { email: 'drsingh@clinic.test', passwordHash: hash, name: 'Dr Singh', role: 'PROVIDER' },
    { email: 'driyer@clinic.test', passwordHash: hash, name: 'Dr Iyer', role: 'PROVIDER' },
    { email: 'drviyom@clinic.test', passwordHash: hash, name: 'Dr Viyom Shukla', role: 'PROVIDER' },
  ]);

  const patients = await Patient.create(
    NAMES.map((name, i) => ({
      name,
      phone: `98765${String(10000 + i)}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.test`,
    }))
  );

  const providers = [patel, singh, iyer, viyom];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - DAYS_BEHIND * 86400000);
  const end = endOfHorizon(today);

  const now = new Date();
  let appts = [];

  for (let day = new Date(start); day <= end; day = new Date(day.getTime() + 86400000)) {
    const weekday = day.getDay();
    if (weekday === 0) continue; // Sunday: the clinic is closed.

    const slots = weekday === 6 ? SATURDAY_SLOTS : WEEKDAY_SLOTS;
    const isToday = day.getTime() === today.getTime();

    for (const provider of providers) {
      for (const slot of slots) {
        // A provider takes an occasional day out of the diary — a full grid on
        // every single day for every single doctor reads as fake.
        if (!isToday && random() < 0.08) continue;

        const [hour, minute] = slot.split(':').map(Number);
        const startsAt = new Date(day);
        startsAt.setHours(hour, minute, 0, 0);

        const past = startsAt < now;
        let status = pick(isToday ? TODAY_MIX : past ? PAST_MIX : FUTURE_MIX);

        // Whatever the mix says, a slot cannot be waiting to happen once it
        // has, and cannot already be finished before it starts.
        if (past && ['REQUESTED', 'CONFIRMED', 'CHECKED_IN'].includes(status)) {
          status = random() < 0.09 ? 'NO_SHOW' : 'COMPLETED';
        }
        if (!past && ['COMPLETED', 'NO_SHOW', 'CHECKED_IN'].includes(status)) {
          status = 'CONFIRMED';
        }

        const booked = status !== 'OPEN';
        const patient = pick(patients);

        appts.push({
          providerId: provider._id,
          providerName: provider.name,
          patientId: booked ? patient._id : null,
          patientName: booked ? patient.name : null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60000),
          durationMin: SLOT_MINUTES,
          status,
          cancelReason: status === 'CANCELLED' ? pick(CANCEL_REASONS) : null,
          cancelledAt: status === 'CANCELLED' ? new Date(startsAt.getTime() - 86400000) : null,
          careTeam: [],
        });
      }
    }
  }

  // Unconfirmed appointments landing inside the next day, which is what the
  // alerts view exists to surface. They are built here, before anything is
  // written, because they have to be reconciled with the diary first.
  //
  // They cannot sit on the grid. An alert has to be a fixed number of minutes
  // from whenever the seed is run, and the grid is fixed to the clock, so they
  // land on the quarter hours in between. A half-hour appointment at 14:15 then
  // runs straight through the 14:30 slot — which is exactly the double booking
  // this used to produce, one patient at 14:15 and another at 14:30 with the
  // same doctor.
  //
  // The alert is the fixture the demo needs and a grid slot is fungible, so
  // where the two collide the grid gives way.
  const soon = [
    { minutesFromNow: 40, provider: patel },
    { minutesFromNow: 50, provider: singh },
    { minutesFromNow: 3 * 60, provider: viyom },
    { minutesFromNow: 5 * 60, provider: patel },
    { minutesFromNow: 20 * 60, provider: iyer },
    { minutesFromNow: 22 * 60, provider: viyom },
  ];

  const alertRows = soon.map(({ minutesFromNow, provider }, i) => {
    const startsAt = new Date(now.getTime() + minutesFromNow * 60000);
    startsAt.setMinutes(startsAt.getMinutes() < 30 ? 15 : 45, 0, 0);

    return {
      providerId: provider._id,
      providerName: provider.name,
      patientId: patients[i]._id,
      patientName: patients[i].name,
      startsAt,
      endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60000),
      durationMin: SLOT_MINUTES,
      status: 'REQUESTED',
      // Two of these carry a supporting doctor as well, so the marker is on
      // the day sheet the moment the demo is opened.
      careTeam:
        i % 3 === 0 ? [{ providerId: viyom._id, assignedBy: desk._id, assignedAt: now }] : [],
    };
  });

  const collides = (a, b) =>
    String(a.providerId) === String(b.providerId) &&
    a.startsAt < b.endsAt &&
    a.endsAt > b.startsAt;

  const evicted = appts.filter((slot) => alertRows.some((alert) => collides(slot, alert)));
  const dropped = new Set(evicted);
  appts = appts.filter((slot) => !dropped.has(slot));

  // Nothing has been written yet, so a clash found here is still a bug in the
  // seed rather than a mess in the database.
  const overlap = firstOverlap([...appts, ...alertRows]);
  if (overlap) {
    const [first, second] = overlap;
    throw new Error(
      `Seed would double-book ${first.providerName}: ${clock(first.startsAt)} ` +
        `(${first.durationMin} min) runs into ${clock(second.startsAt)}.`
    );
  }

  // A second doctor is brought in on some visits. The record keeps them as the
  // care team, and the day sheet prints them next to the patient — so the seed
  // has to produce enough of them, and enough of them on days someone will
  // actually open, for that to be visible without hunting.
  const supportEvents = [];

  for (const appt of appts) {
    if (!appt.patientName || appt.status === 'CANCELLED') continue;

    const upcoming = appt.startsAt >= today;
    const chance = upcoming ? 0.22 : 0.1;
    if (random() > chance) continue;

    const others = providers.filter((p) => !p._id.equals(appt.providerId));
    const support = others[Math.floor(random() * others.length)];

    appt.careTeam.push({
      providerId: support._id,
      assignedBy: desk._id,
      assignedAt: new Date(appt.startsAt.getTime() - 2 * 86400000),
    });

    supportEvents.push({ appt, support });
  }

  const created = await Appointment.insertMany(appts);

  const byKey = new Map(
    created.map((a) => [`${a.providerId}-${a.startsAt.getTime()}`, a._id])
  );

  await AppointmentEvent.insertMany(
    created.map((a) => ({
      appointmentId: a._id,
      actorId: desk._id,
      actorName: desk.name,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt: new Date(a.startsAt.getTime() - 7 * 86400000),
    }))
  );

  await AppointmentEvent.insertMany(
    supportEvents.map(({ appt, support }) => ({
      appointmentId: byKey.get(`${appt.providerId}-${appt.startsAt.getTime()}`),
      actorId: desk._id,
      actorName: desk.name,
      type: 'SUPPORT_ADDED',
      detail: { providerId: support._id.toString(), providerName: support.name },
      createdAt: new Date(appt.startsAt.getTime() - 2 * 86400000),
    }))
  );

  // A handful of visit notes, so a completed appointment opens onto something
  // rather than an empty panel.
  const completed = created.filter((a) => a.status === 'COMPLETED').slice(0, 40);
  await VisitNote.insertMany(
    completed.map((a, i) => ({
      appointmentId: a._id,
      authorId: a.providerId,
      authorName: a.providerName,
      kind: 'CLINICAL',
      body: NOTE_BODIES[i % NOTE_BODIES.length],
      createdAt: new Date(a.startsAt.getTime() + 25 * 60000),
    }))
  );

  // Billing sits on a subset of those visits, not all of them: the point of
  // the split is that a visit can carry a clinical note, a billing note, or
  // both, and a seed where the two always arrive together shows none of that.
  // The front desk writes them, which is the rule the API enforces.
  const billed = completed.filter((_, i) => i % 3 === 0);
  await VisitNote.insertMany(
    billed.map((a, i) => ({
      appointmentId: a._id,
      authorId: desk._id,
      authorName: desk.name,
      kind: 'BILLING',
      ...BILLING_NOTES[i % BILLING_NOTES.length],
      createdAt: new Date(a.startsAt.getTime() + 40 * 60000),
    }))
  );

  // Reconciled against the diary further up, so these can go in as they are.
  const alertAppts = await Appointment.insertMany(alertRows);

  // People waiting for a day that is already full. Windows are anchored to the
  // day the seed runs, so the list is live whenever the demo is opened.
  const dayStart = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const dayEnd = (offset) => {
    const d = dayStart(offset);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const alreadyPlaced = created.find((a) => a.status === 'CONFIRMED' && a.startsAt > now);

  const waitlist = await WaitlistEntry.insertMany([
    {
      patientName: 'Ritu Saxena', phone: '9876500022',
      providerId: patel._id, providerName: patel.name,
      preferredFrom: dayStart(0), preferredTo: dayEnd(2),
      note: 'Works nearby and can come in at an hour of notice.',
    },
    {
      patientName: 'Yusuf Merchant', phone: '9876500023',
      preferredFrom: dayStart(0), preferredTo: dayEnd(4),
      note: 'Happy with any doctor. Mornings only.',
    },
    {
      patientName: 'Siddharth Rane', phone: '9876500024',
      preferredFrom: dayStart(0), preferredTo: dayEnd(1),
      note: 'Walked in this morning, wants the first cancellation going.',
    },
    {
      patientName: 'Pooja Bhatt', phone: '9876500025',
      providerId: singh._id, providerName: singh.name,
      preferredFrom: dayStart(1), preferredTo: dayEnd(6),
      note: 'Asked to be called before 6pm.',
    },
    {
      patientName: 'Lakshmi Subramanian', phone: '9876500026',
      providerId: iyer._id, providerName: iyer.name,
      preferredFrom: dayStart(2), preferredTo: dayEnd(9),
      note: 'Post-op review. Flexible on the day.',
    },
    {
      patientName: 'Devendra Tiwari', phone: '9876500027',
      preferredFrom: dayStart(0), preferredTo: dayEnd(7),
      note: 'Second dose due this week.',
    },
    {
      patientName: 'Ayesha Siddiqui', phone: '9876500028',
      providerId: viyom._id, providerName: viyom.name,
      preferredFrom: dayStart(3), preferredTo: dayEnd(10),
      note: 'Prefers late afternoon.',
    },
    // One of each of the closed states, so the filters on the waitlist page
    // have something to show and the queue is not the only thing anyone sees.
    {
      patientName: alreadyPlaced?.patientName ?? 'Karan Malhotra', phone: '9876500029',
      preferredFrom: dayStart(0), preferredTo: dayEnd(14),
      status: 'PLACED',
      placedAppointmentId: alreadyPlaced?._id ?? null,
      placedAt: new Date(now.getTime() - 2 * 3600000),
      note: 'Rang on Monday, took a cancellation on Tuesday.',
    },
    {
      patientName: 'Nandini Kapoor', phone: '9876500030',
      preferredFrom: dayStart(0), preferredTo: dayEnd(5),
      status: 'REMOVED',
      removedAt: new Date(now.getTime() - 26 * 3600000),
      note: 'Found an appointment at another clinic.',
    },
  ].map((entry, i, all) => ({
    ...entry,
    // The list is a queue and the page numbers it, so the entries need to have
    // been added at distinguishable times. Inserted in one go they share a
    // millisecond, and "who rang first" comes back in whatever order the
    // database feels like — which is not a queue at all.
    createdAt: new Date(now.getTime() - (all.length - i) * 3600000),
    addedById: desk._id,
    addedByName: desk.name,
  })));

  const supported = created.filter((a) => a.careTeam.length).length;
  // Local, not ISO: toISOString() would print the day before for any clinic
  // east of Greenwich and make the horizon look a day short.
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  console.log(`Seeded ${created.length} appointments for ${providers.length} providers`);
  console.log(`  every slot is ${SLOT_MINUTES} minutes, one patient per doctor at a time`);
  console.log(`  schedule runs ${iso(start)} → ${iso(end)}`);
  console.log(`  ${patients.length} patients on the list`);
  console.log(`  ${supported} appointments have a supporting doctor on the care team`);
  console.log(`  ${completed.length} clinical notes, ${billed.length} billing notes`);
  console.log(
    `Added ${alertAppts.length} unconfirmed appointments for the alerts view` +
      (evicted.length ? `, clearing ${evicted.length} grid slots they landed across` : '')
  );
  console.log(
    `Waitlist: ${waitlist.filter((w) => w.status === 'WAITING').length} waiting, ` +
      `${waitlist.length} entries in total`
  );

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
