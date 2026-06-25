const pool = require('../../db/pool');

const LITE_COLUMNS = [
  'id', 'company_name', 'address_line', 'state', 'state_code', 'gstin',
  'email', 'phone', 'bank_details', 'invoice_number_prefix',
  'invoice_terms', 'default_low_stock_threshold', 'amc_reminder_days',
  'invoice_number_seq', 'smtp_enabled', 'smtp_email', 'smtp_host', 'smtp_port',
  'created_at', 'updated_at',
].join(', ');

function sanitizeSettings(row) {
  if (!row) return row;
  const settings = { ...row };
  settings.smtp_app_password_set = row.smtp_app_password_set ?? Boolean(row.smtp_app_password);
  delete settings.smtp_app_password;
  return settings;
}

async function getOrgSettings({ includeAssets = true } = {}) {
  const columns = includeAssets ? '*' : LITE_COLUMNS;
  const passwordFlag = includeAssets ? '' : ", (smtp_app_password <> '') AS smtp_app_password_set";
  const { rows } = await pool.query(
    `SELECT ${columns}${passwordFlag} FROM org_settings ORDER BY created_at LIMIT 1`
  );
  if (rows.length === 0) {
    const { rows: created } = await pool.query(
      `INSERT INTO org_settings (company_name) VALUES ('') RETURNING *`
    );
    return sanitizeSettings(created[0]);
  }
  return sanitizeSettings(rows[0]);
}

async function updateOrgSettings(data) {
  const current = await getOrgSettings();
  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = [
    'company_name', 'address_line', 'state', 'state_code', 'gstin',
    'email', 'phone', 'logo_url', 'signature_url', 'bank_details', 'invoice_number_prefix',
    'invoice_terms', 'default_low_stock_threshold',
    'smtp_enabled', 'smtp_email', 'smtp_host', 'smtp_port',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(data[key]);
    }
  }

  if (data.amc_reminder_days !== undefined) {
    fields.push(`amc_reminder_days = $${idx++}`);
    values.push(JSON.stringify(data.amc_reminder_days));
  }

  if (data.invoice_number_seq !== undefined) {
    fields.push(`invoice_number_seq = $${idx++}`);
    values.push(data.invoice_number_seq);
  }

  if (data.smtp_app_password !== undefined && data.smtp_app_password !== '') {
    fields.push(`smtp_app_password = $${idx++}`);
    values.push(data.smtp_app_password);
  }

  if (fields.length === 0) return sanitizeSettings(current);

  fields.push('updated_at = NOW()');
  values.push(current.id);

  const { rows } = await pool.query(
    `UPDATE org_settings SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return sanitizeSettings(rows[0]);
}

async function getOrgSmtpCredentials() {
  const { rows } = await pool.query(
    `SELECT smtp_enabled, smtp_email, smtp_app_password, smtp_host, smtp_port
     FROM org_settings ORDER BY created_at LIMIT 1`
  );
  if (rows.length === 0) return null;
  return rows[0];
}

async function getPublicBranding() {
  const { rows } = await pool.query(
    `SELECT company_name, logo_url FROM org_settings ORDER BY created_at LIMIT 1`
  );
  if (rows.length === 0) {
    return { company_name: 'Amigo Enterprises', logo_url: null };
  }
  const row = rows[0];
  return {
    company_name: row.company_name || 'Amigo Enterprises',
    logo_url: row.logo_url || null,
  };
}

async function getOrgSettingsAssets() {
  const { rows } = await pool.query(
    `SELECT logo_url, signature_url FROM org_settings ORDER BY created_at LIMIT 1`
  );
  if (rows.length === 0) {
    return { logo_url: null, signature_url: null };
  }
  return {
    logo_url: rows[0].logo_url || null,
    signature_url: rows[0].signature_url || null,
  };
}

async function getNextInvoiceNumber(client) {
  const db = client || pool;
  const { rows } = await db.query(
    `UPDATE org_settings SET invoice_number_seq = invoice_number_seq + 1, updated_at = NOW()
     RETURNING invoice_number_prefix, invoice_number_seq - 1 AS seq`
  );
  const { invoice_number_prefix, seq } = rows[0];
  return `${invoice_number_prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = {
  getOrgSettings,
  updateOrgSettings,
  getNextInvoiceNumber,
  getPublicBranding,
  getOrgSettingsAssets,
  getOrgSmtpCredentials,
  sanitizeSettings,
};
