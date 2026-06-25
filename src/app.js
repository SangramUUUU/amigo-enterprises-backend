const express = require('express');
const cors = require('cors');
const { frontendUrl } = require('./config/env');
const { createSessionMiddleware } = require('./config/session');
const errorHandler = require('./middleware/errorHandler');
const { runInvoiceOverdueCheck, runAmcReminders } = require('./jobs/scheduler');

const authRoutes = require('./modules/auth/routes');
const userRoutes = require('./modules/users/routes');
const orgSettingsRoutes = require('./modules/orgSettings/routes');
const customerRoutes = require('./modules/customers/routes');
const productRoutes = require('./modules/products/routes');
const invoiceRoutes = require('./modules/invoices/routes');
const amcRoutes = require('./modules/amcContracts/routes');
const serviceJobRoutes = require('./modules/serviceJobs/routes');
const notificationRoutes = require('./modules/notifications/routes');
const dashboardRoutes = require('./modules/dashboard/routes');
const verificationRoutes = require('./modules/verification/routes');

const app = express();

app.set('trust proxy', 1);

function resolveAllowedOrigins() {
  const origins = new Set();
  const frontend = process.env.FRONTEND_URL || frontendUrl;
  if (frontend) {
    frontend.split(',').map((u) => u.trim()).filter(Boolean).forEach((u) => origins.add(u));
  }
  origins.add(frontendUrl);
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }
  return [...origins];
}

const allowedOrigins = resolveAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/db-health', async (req, res, next) => {
  try {
    const pool = require('./db/pool');
    const { rows } = await pool.query('SELECT 1 AS ok, NOW() AS server_time');
    res.json({ ok: true, db: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.use(createSessionMiddleware());

app.get('/api/cron/daily', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || '';
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid cron secret' });
    }
    await runInvoiceOverdueCheck();
    await runAmcReminders();
    res.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/org-settings', orgSettingsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/amc-contracts', amcRoutes);
app.use('/api/service-jobs', serviceJobRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/verification', verificationRoutes);

app.use(errorHandler);

module.exports = app;
