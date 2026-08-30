import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Appointment from '../models/Appointment.js';

// The unique slot index changed shape: a cancelled appointment must stop
// reserving its time. Mongoose will not rewrite an index that already exists
// under the same name, so it has to be dropped and rebuilt once per database.
const INDEX = 'uniq_provider_slot_active';

async function run() {
  await connectDB();

  const existing = await Appointment.collection.indexes();
  const current = existing.find((i) => i.name === INDEX);

  if (current) {
    console.log('dropping', INDEX, JSON.stringify(current.partialFilterExpression));
    await Appointment.collection.dropIndex(INDEX);
  } else {
    console.log(INDEX, 'not present, nothing to drop');
  }

  await Appointment.syncIndexes();

  const after = (await Appointment.collection.indexes()).find((i) => i.name === INDEX);
  console.log('rebuilt ', INDEX, JSON.stringify(after?.partialFilterExpression));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('reindex failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
