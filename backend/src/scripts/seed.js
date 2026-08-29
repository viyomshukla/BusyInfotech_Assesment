import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Patient from '../models/Patient.js';
import Appointment from '../models/Appointment.js';
import AppointmentEvent from '../models/AppointmentEvent.js';
import VisitNote from '../models/VisitNote.js';

const NAMES = [
  'Asha Rao', 'Vikram Shah', 'Meera Nair', 'Rohit Verma', 'Sana Khan',
  'Arjun Menon', 'Priya Das', 'Kabir Joshi', 'Neha Pillai', 'Imran Sheikh',
];

const STATUS_MIX = [
  'OPEN', 'REQUESTED', 'REQUESTED', 'CONFIRMED', 'CONFIRMED',
  'CHECKED_IN', 'COMPLETED', 'COMPLETED', 'NO_SHOW', 'CANCELLED',
];

async function run() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    VisitNote.deleteMany({}),
    AppointmentEvent.collection.deleteMany({}),
  ]);

  const hash = await bcrypt.hash('password123', 10);
  const [desk, patel, singh, iyer] = await User.create([
    { email: 'desk@clinic.test', passwordHash: hash, name: 'Front Desk', role: 'FRONT_DESK' },
    { email: 'drpatel@clinic.test', passwordHash: hash, name: 'Dr Patel', role: 'PROVIDER' },
    { email: 'drsingh@clinic.test', passwordHash: hash, name: 'Dr Singh', role: 'PROVIDER' },
    { email: 'driyer@clinic.test', passwordHash: hash, name: 'Dr Iyer', role: 'PROVIDER' },
  ]);

  const patients = await Patient.create(
    NAMES.map((name, i) => ({ name, phone: `98765${String(10000 + i)}` }))
  );

  const providers = [patel, singh, iyer];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const appts = [];
  for (let day = -21; day <= 14; day++) {
    for (const provider of providers) {
      for (let slot = 0; slot < 6; slot++) {
        const startsAt = new Date(today);
        startsAt.setDate(startsAt.getDate() + day);
        startsAt.setHours(9 + slot, 0, 0, 0);

        const past = startsAt < new Date();
        let status = STATUS_MIX[Math.floor(Math.random() * STATUS_MIX.length)];
        if (past && ['OPEN', 'REQUESTED', 'CONFIRMED'].includes(status)) {
          status = Math.random() < 0.25 ? 'NO_SHOW' : 'COMPLETED';
        }
        if (!past && ['COMPLETED', 'NO_SHOW', 'CHECKED_IN'].includes(status)) {
          status = 'CONFIRMED';
        }

        const booked = status !== 'OPEN';
        const patient = patients[Math.floor(Math.random() * patients.length)];

        appts.push({
          providerId: provider._id,
          providerName: provider.name,
          patientId: booked ? patient._id : null,
          patientName: booked ? patient.name : null,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60000),
          durationMin: 30,
          status,
          cancelReason: status === 'CANCELLED' ? 'Patient rescheduled' : null,
          cancelledAt: status === 'CANCELLED' ? new Date(startsAt) : null,
        });
      }
    }
  }

  const created = await Appointment.insertMany(appts);

  await AppointmentEvent.insertMany(
    created.map((a) => ({
      appointmentId: a._id,
      actorId: desk._id,
      actorName: desk.name,
      type: 'CREATED',
      toStatus: 'OPEN',
      createdAt: a.startsAt,
    }))
  );
  const soon = [
    { minutesFromNow: 40, provider: patel },
    { minutesFromNow: 50, provider: singh },
    { minutesFromNow: 5 * 60, provider: patel },
    { minutesFromNow: 20 * 60, provider: iyer },
  ];

  const alertAppts = await Appointment.insertMany(
    soon.map(({ minutesFromNow, provider }, i) => {
      const startsAt = new Date(Date.now() + minutesFromNow * 60000);
      return {
        providerId: provider._id,
        providerName: provider.name,
        patientId: patients[i]._id,
        patientName: patients[i].name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60000),
        durationMin: 30,
        status: 'REQUESTED',
      };
    })
  );

  console.log(`Added ${alertAppts.length} unconfirmed appointments for the alerts view`);
  console.log(`Seeded ${created.length} appointments across ${providers.length} providers`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error(err); process.exit(1); });

