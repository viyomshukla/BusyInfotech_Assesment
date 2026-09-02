import { Router } from 'express';
import { z } from 'zod';
import Appointment from '../models/Appointment.js';
import AppointmentEvent from '../models/AppointmentEvent.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { STATUSES } from '../models/Appointment.js';
import * as service from '../services/appointment.service.js';
import VisitNote from '../models/VisitNote.js';
import { toCsv } from '../utils/csv.js';
import { startOfLocalDay, endOfLocalDay } from '../utils/day.js';
import { format } from 'date-fns';
const noteSchema = z.object({ body: z.string().min(1).max(5000) });
const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

const createSchema = z.object({
  providerId: objectId,
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(480),
});
// A plain YYYY-MM-DD means the whole local day, not the instant at midnight UTC:
// "to=2026-08-29" has to include everything that starts on the 29th.
const DATE_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const dayBoundary = (edge) =>
  z
    .union([z.string(), z.date()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return undefined;
      if (typeof value === 'string' && DATE_ONLY.test(value)) {
        return edge === 'end' ? endOfLocalDay(value) : startOfLocalDay(value);
      }
      return new Date(value);
    })
    .refine((value) => value === undefined || !Number.isNaN(value.getTime()), {
      message: 'Provide a valid date.',
    });

const listSchema = z.object({
  q: z.string().optional(),
  providerId: objectId.optional(),
  status: z.union([z.enum(STATUSES), z.array(z.enum(STATUSES))]).optional(),
  from: dayBoundary('start'),
  to: dayBoundary('end'),
  sort: z.enum(['date', 'status', 'provider']).default('date'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
const updateSchema = z
  .object({
    startsAt: z.coerce.date().optional(),
    durationMin: z.number().int().min(5).max(480).optional(),
  })
  .refine((v) => v.startsAt || v.durationMin, {
    message: 'Provide startsAt or durationMin',
  });

const bookSchema = z
  .object({
    patientId: objectId.optional(),
    patientName: z.string().min(1).optional(),
    phone: z.string().optional(),
  })
  .refine((v) => v.patientId || v.patientName, {
    message: 'Provide patientId or patientName',
  });
const generateSchema = z.object({
  providerId: objectId,
  from: z.coerce.date(),
  to: z.coerce.date(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  blocks: z
    .array(
      z.object({
        // The clock picker can set seconds, so the seconds component is
        // accepted as well as the plain HH:MM the field used to carry.
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM or HH:MM:SS'),
        durationMin: z.number().int().min(5).max(480),
      })
    )
    .min(1),
});
const statusSchema = z.object({
  to: z.enum(STATUSES),
  reason: z.string().optional(),
});

router.post('/', validate(createSchema), async (req, res) => {
  res.status(201).json(await service.createSlot(req.body, req.user));
});

router.patch('/:id', validate(updateSchema), async (req, res) => {
  res.json(await service.updateSlot(req.params.id, req.body, req.user));
});

router.post('/:id/book', validate(bookSchema), async (req, res) => {
  res.json(await service.bookSlot(req.params.id, req.body, req.user));
});

router.post('/:id/status', validate(statusSchema), async (req, res) => {
  res.json(await service.changeStatus(req.params.id, req.body, req.user));
});

router.post('/:id/reassign', validate(z.object({ providerId: objectId })), async (req, res) => {
  res.json(await service.reassignProvider(req.params.id, req.body, req.user));
});

router.post('/:id/archive', async (req, res) => {
  res.json(await service.setArchived(req.params.id, true, req.user));
});

router.post('/:id/restore', async (req, res) => {
  res.json(await service.setArchived(req.params.id, false, req.user));
});
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  res.json(await service.listAppointments(parsed.data, req.user));
});
router.get('/:id', async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  if (req.user.role === 'PROVIDER') {
    const mine =
      appt.providerId.toString() === req.user._id.toString() ||
      appt.careTeam.some((m) => m.providerId.toString() === req.user._id.toString());
    if (!mine) {
      return res
        .status(403)
        .json({ error: 'You can only open appointments on your own schedule.' });
    }
  }

  const [timeline, notes] = await Promise.all([
    AppointmentEvent.find({ appointmentId: appt._id }).sort({ createdAt: 1 }),
    VisitNote.find({ appointmentId: appt._id }).sort({ createdAt: 1 }),
  ]);

  res.json({ appointment: appt, timeline, notes });
});
router.post('/:id/notes', validate(noteSchema), async (req, res) => {
  res.status(201).json(await service.addNote(req.params.id, req.body, req.user));
});

router.patch('/notes/:noteId', validate(noteSchema), async (req, res) => {
  res.json(await service.editNote(req.params.noteId, req.body, req.user));
});

router.post('/:id/care-team', validate(z.object({ providerId: objectId })), async (req, res) => {
  res.json(await service.addSupportingProvider(req.params.id, req.body, req.user));
});

router.delete('/:id/care-team/:providerId', async (req, res) => {
  res.json(await service.removeSupportingProvider(req.params.id, req.params.providerId, req.user));
});

router.get('/mine/schedule', async (req, res) => {
  res.json(await service.listMySchedule(req.user, { includeArchived: req.query.archived === 'true' }));
});
router.post('/generate', validate(generateSchema), async (req, res) => {
  res.status(201).json(await service.generateSlots(req.body, req.user));
});

router.get('/export/day', async (req, res) => {
  const { date, providerId } = req.query;
  if (!date) return res.status(400).json({ error: 'A date is required.' });

  const rows = await service.getDaySchedule(date, providerId, req.user);

  const csv = toCsv(rows, [
    // Local clinic time — toISOString() here would print UTC and read hours out.
    { label: 'Time', value: (r) => format(new Date(r.startsAt), 'HH:mm') },
    { label: 'End', value: (r) => format(new Date(r.endsAt), 'HH:mm') },
    { label: 'Duration (min)', value: (r) => r.durationMin },
    { label: 'Provider', value: (r) => r.providerName },
    { label: 'Patient', value: (r) => r.patientName ?? '' },
    { label: 'Status', value: (r) => r.status },
    { label: 'Cancel reason', value: (r) => r.cancelReason ?? '' },
  ]);

  const day = format(startOfLocalDay(date), 'yyyy-MM-dd');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="schedule-${day}.csv"`);
  res.send('\uFEFF' + csv);
});
export default router;