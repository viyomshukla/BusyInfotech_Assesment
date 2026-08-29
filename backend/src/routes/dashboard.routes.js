import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboard.service.js';
import { listAlerts, dismissAlert } from '../services/alerts.service.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await getDashboard(req.user));
});

router.get('/alerts', async (req, res) => {
  res.json(await listAlerts(req.user));
});

router.post('/alerts/:appointmentId/dismiss', async (req, res) => {
  res.json(await dismissAlert(req.params.appointmentId, req.user));
});

export default router;