require('dotenv').config();

const host = process.env.HOST || '0.0.0.0';

function start() {
  const cron = require('node-cron');
  const { port } = require('./config/env');
  const app = require('./app');
  const { runInvoiceOverdueCheck, runAmcReminders } = require('./jobs/scheduler');

  cron.schedule('0 6 * * *', async () => {
    try {
      await runInvoiceOverdueCheck();
      await runAmcReminders();
    } catch (err) {
      console.error('Scheduled job error:', err);
    }
  });

  const server = app.listen(port, host, () => {
    console.log(`API server listening on ${host}:${port}`);
    const pool = require('./db/pool');
    pool.query('SELECT 1').catch((err) => {
      console.error('Initial DB check failed:', err.message);
    });
  });

  server.on('error', (err) => {
    console.error('Server failed to bind:', err.message);
    process.exit(1);
  });
}

try {
  start();
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
