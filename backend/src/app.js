import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/user.routes.js';
const app = express();

app.set('trust proxy', 1);

app.use(helmet());

const trimSlash = (value) => (value.endsWith('/') ? value.slice(0, -1) : value);

const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((entry) => trimSlash(entry.trim()))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header at all: same-origin navigations, curl, health checks.
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(trimSlash(origin)));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.get("/",(req,res)=> {
  res.json({
    msg:"Hello world"
  })
})
app.use('/api/appointments', appointmentRoutes);
app.use('/api/auth', authRoutes);
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);

  // A malformed id in the path is a bad request, not a broken server. Left
  // alone, Mongoose's own message comes back with a 500 and names the model and
  // the field it failed on, which is nobody's business outside this process.
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'That is not a valid id.' });
  }

  // A model-level validator that something reached without going through a
  // route schema — the phone rule, for instance.
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors ?? {})[0];
    return res.status(400).json({ error: first?.message ?? 'That data is not valid.' });
  }

  // Everything the app raises deliberately carries a status and a message meant
  // to be read. Anything else is a surprise, and its message is for the log.
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  res.status(500).json({ error: 'Something went wrong on our side.' });
});

export default app;