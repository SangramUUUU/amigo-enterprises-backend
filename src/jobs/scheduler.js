const pool = require('../db/pool');
const { getOrgSettings } = require('../modules/orgSettings/service');
const { notifyAdmins } = require('../modules/notifications/service');

async function runInvoiceOverdueCheck() {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = 'overdue', updated_at = NOW()
     WHERE status IN ('sent', 'partially_paid')
       AND due_date IS NOT NULL
       AND due_date < CURRENT_DATE`
  );
  if (rowCount > 0) {
    console.log(`Marked ${rowCount} invoice(s) as overdue`);
  }
}

async function runAmcReminders() {
  const org = await getOrgSettings();
  const reminderDays = Array.isArray(org.amc_reminder_days)
    ? org.amc_reminder_days
    : JSON.parse(org.amc_reminder_days || '[60, 15]');

  const { rows: contracts } = await pool.query(
    `SELECT * FROM amc_contracts WHERE is_active = true AND end_date >= CURRENT_DATE`
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const contract of contracts) {
    const end = new Date(contract.end_date);
    end.setHours(0, 0, 0, 0);
    const daysUntilEnd = Math.ceil((end - today) / (1000 * 60 * 60 * 24));

    if (!reminderDays.includes(daysUntilEnd)) continue;

    const lastSent = contract.last_reminder_sent_at
      ? new Date(contract.last_reminder_sent_at)
      : null;
    if (lastSent) {
      const daysSinceSent = Math.floor((today - lastSent) / (1000 * 60 * 60 * 24));
      if (daysSinceSent < 1) continue;
    }

    await notifyAdmins({
      type: 'amc_expiry',
      title: `AMC expiring in ${daysUntilEnd} days: ${contract.contract_number}`,
      message: `Contract ${contract.contract_number} expires on ${contract.end_date}.`,
      entityType: 'amc_contract',
      entityId: contract.id,
    });

    await pool.query(
      `UPDATE amc_contracts SET last_reminder_sent_at = NOW() WHERE id = $1`,
      [contract.id]
    );
  }
}

module.exports = { runInvoiceOverdueCheck, runAmcReminders };
