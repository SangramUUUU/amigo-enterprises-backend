const pool = require('../db/pool');

async function writeAuditLog(userId, action, entityType, entityId, details, client) {
  const db = client || pool;
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId || null, details ? JSON.stringify(details) : null]
  );
}

module.exports = { writeAuditLog };
