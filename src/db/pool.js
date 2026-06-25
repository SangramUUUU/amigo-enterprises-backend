const { Pool } = require('pg');
const { databaseUrl } = require('../config/env');

function isSupabaseUrl(url) {
  return /supabase\.com/i.test(url);
}

function normalizeConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  if (!isSupabaseUrl(connectionString)) return connectionString;
  return connectionString
    .replace(/[?&]sslmode=[^&]*/gi, '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');
}

function createPoolConfig(connectionString = databaseUrl) {
  const normalized = normalizeConnectionString(connectionString);
  const config = { connectionString: normalized };

  if (isSupabaseUrl(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

const pool = new Pool({
  ...createPoolConfig(),
  max: 10,
  min: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('Unexpected idle pool error:', err.message);
});

module.exports = pool;
module.exports.createPoolConfig = createPoolConfig;
module.exports.isSupabaseUrl = isSupabaseUrl;
