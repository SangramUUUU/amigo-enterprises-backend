const pool = require('../../db/pool');

async function listForUser(userId, role, { type, unreadOnly }) {
  const conditions = [
    `(n.recipient_id = $1 OR (n.recipient_id IS NULL AND $2 IN ('admin', 'super_admin')))`,
  ];
  const values = [userId, role];
  let idx = 3;

  if (type) {
    conditions.push(`n.type = $${idx++}`);
    values.push(type);
  }
  if (unreadOnly === 'true' || unreadOnly === true) {
    conditions.push('n.is_read = false');
  }

  const { rows } = await pool.query(
    `SELECT n.* FROM notifications n
     WHERE ${conditions.join(' AND ')}
     ORDER BY n.created_at DESC
     LIMIT 100`,
    values
  );
  return rows;
}

async function getUnreadCount(userId, role) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications n
     WHERE (n.recipient_id = $1 OR (n.recipient_id IS NULL AND $2 IN ('admin', 'super_admin')))
       AND n.is_read = false`,
    [userId, role]
  );
  return rows[0].count;
}

async function markRead(id, userId, role) {
  const { rows } = await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE id = $1 AND (recipient_id = $2 OR (recipient_id IS NULL AND $3 IN ('admin', 'super_admin')))
     RETURNING *`,
    [id, userId, role]
  );
  if (rows.length === 0) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

module.exports = { listForUser, getUnreadCount, markRead };
