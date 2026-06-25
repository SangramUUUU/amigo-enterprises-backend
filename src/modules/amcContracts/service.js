const pool = require('../../db/pool');
const { getOrgSettings } = require('../orgSettings/service');

function computeContractStatus(endDate, reminderDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  if (end < today) return 'expired';

  const daysUntilEnd = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
  const maxReminder = Math.max(...reminderDays, 0);
  if (daysUntilEnd <= maxReminder) return 'expiring_soon';
  return 'active';
}

function enrichContract(contract, reminderDays) {
  const days = Array.isArray(reminderDays) ? reminderDays : JSON.parse(reminderDays || '[60,15]');
  return {
    ...contract,
    computed_status: computeContractStatus(contract.end_date, days),
  };
}

async function listContracts({ q, customerId, includeInactive }) {
  const org = await getOrgSettings({ includeAssets: false });
  const reminderDays = org.amc_reminder_days;

  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeInactive) conditions.push('a.is_active = true');
  if (customerId) {
    conditions.push(`a.customer_id = $${idx++}`);
    values.push(customerId);
  }
  if (q) {
    conditions.push(`(a.contract_number ILIKE $${idx} OR c.name ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT a.*, c.name AS customer_name, p.name AS product_name
     FROM amc_contracts a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN products p ON p.id = a.product_id
     ${where}
     ORDER BY a.end_date ASC`,
    values
  );
  return rows.map((r) => enrichContract(r, reminderDays));
}

async function getContract(id) {
  const org = await getOrgSettings({ includeAssets: false });
  const { rows } = await pool.query(
    `SELECT a.*, c.name AS customer_name, p.name AS product_name
     FROM amc_contracts a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN products p ON p.id = a.product_id
     WHERE a.id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  return enrichContract(rows[0], org.amc_reminder_days);
}

async function createContract(data) {
  const { rows } = await pool.query(
    `INSERT INTO amc_contracts (
      contract_number, customer_id, product_id, equipment_description,
      origin_invoice_id, start_date, end_date, contract_value,
      visit_frequency, custom_frequency_days, notes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      data.contract_number,
      data.customer_id,
      data.product_id || null,
      data.equipment_description || null,
      data.origin_invoice_id || null,
      data.start_date,
      data.end_date,
      data.contract_value || 0,
      data.visit_frequency || 'yearly',
      data.custom_frequency_days || null,
      data.notes || null,
    ]
  );
  return getContract(rows[0].id);
}

async function updateContract(id, data) {
  const existing = await getContract(id);
  if (!existing) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE amc_contracts SET
      contract_number = COALESCE($1, contract_number),
      customer_id = COALESCE($2, customer_id),
      product_id = COALESCE($3, product_id),
      equipment_description = COALESCE($4, equipment_description),
      origin_invoice_id = COALESCE($5, origin_invoice_id),
      start_date = COALESCE($6, start_date),
      end_date = COALESCE($7, end_date),
      contract_value = COALESCE($8, contract_value),
      visit_frequency = COALESCE($9, visit_frequency),
      custom_frequency_days = COALESCE($10, custom_frequency_days),
      notes = COALESCE($11, notes),
      updated_at = NOW()
     WHERE id = $12 RETURNING *`,
    [
      data.contract_number, data.customer_id, data.product_id,
      data.equipment_description, data.origin_invoice_id,
      data.start_date, data.end_date, data.contract_value,
      data.visit_frequency, data.custom_frequency_days, data.notes, id,
    ]
  );
  return getContract(rows[0].id);
}

async function softDeleteContract(id) {
  const { rows } = await pool.query(
    `UPDATE amc_contracts SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('Contract not found');
    err.status = 404;
    throw err;
  }
  return getContract(id);
}

async function generateContractNumber() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM amc_contracts');
  const seq = rows[0].cnt + 1;
  return `AMC-${String(seq).padStart(4, '0')}`;
}

module.exports = {
  listContracts,
  getContract,
  createContract,
  updateContract,
  softDeleteContract,
  generateContractNumber,
  computeContractStatus,
};
