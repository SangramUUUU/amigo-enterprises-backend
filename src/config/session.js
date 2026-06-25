const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const pool = require('../db/pool');
const { sessionSecret, sessionMaxAgeMs, nodeEnv, frontendUrl } = require('./env');

const PgSession = connectPgSimple(session);

function createSessionMiddleware() {
  const crossOriginFrontend = Boolean(
    process.env.FRONTEND_URL
    && frontendUrl
    && process.env.NODE_ENV === 'production'
    && !process.env.FRONTEND_URL.includes('localhost')
  );

  return session({
    store: new PgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: sessionMaxAgeMs,
      httpOnly: true,
      secure: nodeEnv === 'production',
      sameSite: crossOriginFrontend ? 'none' : 'lax',
    },
  });
}

module.exports = { createSessionMiddleware };
