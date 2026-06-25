const dns = require('node:dns');
const { Pool } = require('pg');
const { databaseUrl } = require('../config/env');

// Vercel/serverless: prefer IPv4 when resolving Supabase hostnames (avoids 60s hangs).
if (process.env.VERCEL) {
  dns.setDefaultResultOrder('ipv4first');
}

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

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const pool = new Pool({
  ...createPoolConfig(),
  max: isServerless ? 1 : 10,
  min: 0,
  idleTimeoutMillis: isServerless ? 5_000 : 30_000,
  connectionTimeoutMillis: isServerless ? 8_000 : 10_000,
  allowExitOnIdle: isServerless,
});

pool.on('error', (err) => {
  console.error('Unexpected idle pool error:', err.message);
});

module.exports = pool;
module.exports.createPoolConfig = createPoolConfig;
module.exports.isSupabaseUrl = isSupabaseUrl;
