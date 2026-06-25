require('dotenv').config();
const { Pool } = require('pg');
const { createPoolConfig, isSupabaseUrl } = require('./pool');

const DB_NAME = 'amigo_invoice_erp';

async function ensureDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  if (isSupabaseUrl(databaseUrl)) {
    console.log(
      'Supabase detected — skipping CREATE DATABASE (use database name "postgres" in DATABASE_URL).'
    );
    return;
  }

  const adminUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, '/postgres$1');
  const admin = new Pool(createPoolConfig(adminUrl));

  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (exists.rows.length === 0) {
      await admin.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`Created database ${DB_NAME}`);
    } else {
      console.log(`Database ${DB_NAME} already exists`);
    }
  } finally {
    await admin.end();
  }
}

ensureDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
