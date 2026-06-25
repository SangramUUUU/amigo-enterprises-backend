const pool = require('../../db/pool');

function applyShippingFromBilling(data) {
  if (data.same_as_billing) {
    data.shipping_address = data.billing_address;
    data.shipping_state = data.billing_state;
    data.shipping_state_code = data.billing_state_code;
  }
  return data;
}

async function listCustomers({ q, includeInactive }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeInactive) {
    conditions.push('is_active = true');
  }
  if (q) {
    conditions.push(
      `(name ILIKE $${idx} OR gstin ILIKE $${idx} OR contact_person ILIKE $${idx} OR email ILIKE $${idx})`
    );
    values.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM customers ${where} ORDER BY name ASC`,
    values
  );
  return rows;
}

async function getCustomer(id) {
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createCustomer(data) {
  data = applyShippingFromBilling({ ...data });
  const { rows } = await pool.query(
    `INSERT INTO customers (
      name, gstin, billing_address, billing_state, billing_state_code,
      shipping_address, shipping_state, shipping_state_code, same_as_billing,
      email, contact_person, mobile
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      data.name, data.gstin || null, data.billing_address || '',
      data.billing_state || '', data.billing_state_code || '',
      data.shipping_address || '', data.shipping_state || '',
      data.shipping_state_code || '', data.same_as_billing !== false,
      data.email || null, data.contact_person || null, data.mobile || null,
    ]
  );
  return rows[0];
}

async function updateCustomer(id, data) {
  const existing = await getCustomer(id);
  if (!existing) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  const merged = applyShippingFromBilling({ ...existing, ...data });
  const { rows } = await pool.query(
    `UPDATE customers SET
      name = $1, gstin = $2, billing_address = $3, billing_state = $4,
      billing_state_code = $5, shipping_address = $6, shipping_state = $7,
      shipping_state_code = $8, same_as_billing = $9, email = $10,
      contact_person = $11, mobile = $12, updated_at = NOW()
     WHERE id = $13 RETURNING *`,
    [
      merged.name, merged.gstin, merged.billing_address, merged.billing_state,
      merged.billing_state_code, merged.shipping_address, merged.shipping_state,
      merged.shipping_state_code, merged.same_as_billing, merged.email,
      merged.contact_person, merged.mobile, id,
    ]
  );
  return rows[0];
}

async function softDeleteCustomer(id) {
  const { rows } = await pool.query(
    `UPDATE customers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

module.exports = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
};
