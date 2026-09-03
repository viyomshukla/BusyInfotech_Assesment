import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { WAITLIST_STATUSES } from '../models/WaitlistEntry.js';
import * as service from '../services/waitlist.service.js';
// The same phone rule the booking form applies. A second copy of it here is
// how the two quietly start disagreeing about what a valid number is.
import { phoneField } from './appointment.routes.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

// A select that has been left on its blank option sends an empty string, and
// an empty string is the same answer as "no preference" — both land as null.
const blankable = (schema) =>
  z
    .union([schema, z.literal(''), z.null()])
    .optional()
    .transform((value) => value || null);

const addSchema = z.object({
  patientName: z.string().trim().min(1, 'Give the patient a name.').max(120),
  phone: phoneField,
  providerId: blankable(objectId),
  preferredFrom: dateOnly,
  preferredTo: dateOnly.optional(),
  note: blankable(z.string().trim().max(500)),
});

const listSchema = z.object({
  status: z.enum([...WAITLIST_STATUSES, 'ALL']).default('WAITING'),
  date: dateOnly.optional(),
  providerId: objectId.optional(),
});

router.post('/', validate(addSchema), async (req, res) => {
  res.status(201).json(await service.addToWaitlist(req.body, req.user));
});

router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query',
      details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  res.json(await service.listWaitlist(parsed.data, req.user));
});

router.delete('/:id', async (req, res) => {
  res.json(await service.removeFromWaitlist(req.params.id, req.user));
});

router.post('/:id/place', validate(z.object({ appointmentId: objectId })), async (req, res) => {
  res.json(await service.placeFromWaitlist(req.params.id, req.body, req.user));
});

export default router;
