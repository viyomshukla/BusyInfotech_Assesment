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

const NOTE_BODIES = [
  'Reviewed symptoms, no red flags. Continue current medication and review in six weeks.',
  'Blood pressure slightly raised. Repeat reading booked for next visit.',
  'Dressing changed and wound is healing cleanly. Advised to keep it dry for 48 hours.',
  'Discussed physiotherapy plan. Home exercises given, progress to be reviewed next month.',
  'Routine follow-up. Patient reports the pain has settled; discharged from this episode.',
];

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
  const appts = [];

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
          endsAt: new Date(startsAt.getTime() + 30 * 60000),
          durationMin: 30,
          status,
          cancelReason: status === 'CANCELLED' ? pick(CANCEL_REASONS) : null,
          cancelledAt: status === 'CANCELLED' ? new Date(startsAt.getTime() - 86400000) : null,
          careTeam: [],
        });
      }
    }
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
      body: NOTE_BODIES[i % NOTE_BODIES.length],
      createdAt: new Date(a.startsAt.getTime() + 25 * 60000),
    }))
  );

  // Unconfirmed appointments landing in the next day, which is what the alerts
  // view exists to surface.
  const soon = [
    { minutesFromNow: 40, provider: patel },
    { minutesFromNow: 50, provider: singh },
    { minutesFromNow: 3 * 60, provider: viyom },
    { minutesFromNow: 5 * 60, provider: patel },
    { minutesFromNow: 20 * 60, provider: iyer },
    { minutesFromNow: 22 * 60, provider: viyom },
  ];

  const alertAppts = await Appointment.insertMany(
    soon.map(({ minutesFromNow, provider }, i) => {
      const startsAt = new Date(Date.now() + minutesFromNow * 60000);
      // The generated diary sits on the hour and the half hour, and a provider
      // may hold only one slot per instant — landing these on the quarters
      // keeps them clear of it whatever time the seed is run.
      startsAt.setMinutes(startsAt.getMinutes() < 30 ? 15 : 45, 0, 0);
      return {
        providerId: provider._id,
        providerName: provider.name,
        patientId: patients[i]._id,
        patientName: patients[i].name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60000),
        durationMin: 30,
        status: 'REQUESTED',
        // Two of these carry a supporting doctor as well, so the marker is on
        // the day sheet the moment the demo is opened.
        careTeam:
          i % 3 === 0
            ? [{ providerId: viyom._id, assignedBy: desk._id, assignedAt: new Date() }]
            : [],
      };
    })
  );

  const supported = created.filter((a) => a.careTeam.length).length;
  // Local, not ISO: toISOString() would print the day before for any clinic
  // east of Greenwich and make the horizon look a day short.
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  console.log(`Seeded ${created.length} appointments for ${providers.length} providers`);
  console.log(`  schedule runs ${iso(start)} → ${iso(end)}`);
  console.log(`  ${patients.length} patients on the list`);
  console.log(`  ${supported} appointments have a supporting doctor on the care team`);
  console.log(`  ${completed.length} visit notes`);
  console.log(`Added ${alertAppts.length} unconfirmed appointments for the alerts view`);

  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });
