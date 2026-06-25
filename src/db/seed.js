const bcrypt = require('bcryptjs');
const pool = require('./pool');
const {
  seedSuperAdminEmail,
  seedSuperAdminPassword,
} = require('../config/env');

async function seed() {
  if (!seedSuperAdminEmail || !seedSuperAdminPassword) {
    throw new Error(
      'SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD must be set'
    );
  }

  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(seedSuperAdminPassword, 12);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = 'super_admin',
         is_active = true,
         updated_at = NOW()`,
      ['Super Admin', seedSuperAdminEmail, passwordHash]
    );
    console.log(`Super Admin seeded: ${seedSuperAdminEmail}`);

    const { rows } = await client.query('SELECT id FROM org_settings LIMIT 1');
    if (rows.length === 0) {
      await client.query(
        `INSERT INTO org_settings (
          company_name, address_line, state, state_code, gstin,
          invoice_number_prefix, invoice_terms, amc_reminder_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          'Amigo Enterprises',
          '',
          'Maharashtra',
          '27',
          '',
          'AETX',
          '1. Payment due within 30 days.\n2. Subject to jurisdiction.',
          JSON.stringify([60, 15]),
        ]
      );
      console.log('Org settings seeded.');
    } else {
      console.log('Org settings already exist.');
    }

    console.log('Seed complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
