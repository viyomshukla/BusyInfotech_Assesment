import { Router } from 'express';
import { z } from 'zod';
import Appointment from '../models/Appointment.js';
import AppointmentEvent from '../models/AppointmentEvent.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { STATUSES } from '../models/Appointment.js';
import * as service from '../services/appointment.service.js';
import VisitNote from '../models/VisitNote.js';
const noteSchema = z.object({ body: z.string().min(1).max(5000) });
const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

const createSchema = z.object({
  providerId: objectId,
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(480),
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

router.get('/:id', async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

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
export default router;