const { Pool } = require('pg');
const { databaseUrl } = require('../config/env');

function isSupabaseUrl(url) {
  return /supabase\.com/i.test(url);
}

function normalizeConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  // pg v8+ treats sslmode=require as strict verification; Supabase pooler needs relaxed TLS.
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

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const pool = new Pool({
  ...createPoolConfig(),
  max: isServerless ? 3 : 10,
  min: isServerless ? 0 : 2,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: isServerless ? 5_000 : 10_000,
});

module.exports = pool;
module.exports.createPoolConfig = createPoolConfig;
module.exports.isSupabaseUrl = isSupabaseUrl;
