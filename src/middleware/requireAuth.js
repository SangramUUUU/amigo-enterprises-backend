const pool = require('../db/pool');

async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    const cached = req.session.user;
    if (cached?.id === req.session.userId) {
      req.user = cached;
      return next();
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, role, is_active FROM users
       WHERE id = $1 AND is_active = true`,
      [req.session.userId]
    );

    if (rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    req.session.user = rows[0];
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
