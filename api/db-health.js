const dns = require('node:dns');

if (process.env.VERCEL) {
  dns.setDefaultResultOrder('ipv4first');
}

function maskDatabaseUrl(url) {
  if (!url) return null;
  return url.replace(/:([^:@/]+)@/, ':***@');
}

module.exports = async (req, res) => {
  const started = Date.now();
  const checks = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasSessionSecret: Boolean(process.env.SESSION_SECRET),
    nodeEnv: process.env.NODE_ENV || 'unknown',
    vercel: Boolean(process.env.VERCEL),
    databaseHost: null,
  };

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      ok: false,
      message: 'DATABASE_URL is not set in Vercel environment variables',
      checks,
      elapsedMs: Date.now() - started,
    });
  }

  try {
    const url = process.env.DATABASE_URL.trim();
    checks.databaseHost = (url.match(/@([^/?]+)/) || [])[1] || null;

    const { Pool } = require('pg');
    const isSupabase = /supabase\.com/i.test(url);
    const connectionString = url
      .replace(/[?&]sslmode=[^&]*/gi, '')
      .replace(/[?&]$/, '');

    const pool = new Pool({
      connectionString,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
      max: 1,
      connectionTimeoutMillis: 8_000,
    });

    const queryPromise = pool.query('SELECT 1 AS ok, NOW() AS server_time');
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timed out after 8 seconds')), 8000);
    });

    const { rows } = await Promise.race([queryPromise, timeoutPromise]);
    await pool.end();

    return res.json({
      ok: true,
      message: 'Database connection successful',
      checks: { ...checks, databaseUrl: maskDatabaseUrl(url) },
      db: rows[0],
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      message: err.message,
      checks: { ...checks, databaseUrl: maskDatabaseUrl(process.env.DATABASE_URL) },
      hint: 'Use Supabase Session pooler (port 5432) or Transaction pooler (port 6543). URL-encode special characters in the password.',
      elapsedMs: Date.now() - started,
    });
  }
};
