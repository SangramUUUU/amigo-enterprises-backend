require('dotenv').config();
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

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
  const pool = require('./db/pool');
  pool.query('SELECT 1').catch(() => {});
});
