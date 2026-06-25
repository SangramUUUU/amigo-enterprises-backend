const pool = require('../../db/pool');
const { getOrgSettings } = require('../orgSettings/service');
const { sendEmail } = require('../../utils/email');

async function createNotification({ recipientId, type, title, message, entityType, entityId }, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `INSERT INTO notifications (recipient_id, type, title, message, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [recipientId || null, type, title, message, entityType || null, entityId || null]
  );
  return rows[0];
}

async function notifyAdmins({ type, title, message, entityType, entityId }, client) {
  const notification = await createNotification(
    { recipientId: null, type, title, message, entityType, entityId },
    client
  );

  const { rows: admins } = await pool.query(
    `SELECT email FROM users WHERE role IN ('admin', 'super_admin') AND is_active = true`
  );
  for (const admin of admins) {
    await sendEmail({ to: admin.email, subject: title, text: message });
  }
  return notification;
}

async function checkLowStock(product, client) {
  const org = await getOrgSettings({ includeAssets: false });
  const threshold =
    product.low_stock_threshold != null
      ? Number(product.low_stock_threshold)
      : Number(org.default_low_stock_threshold);

  const stock = Number(product.stock_quantity);

  if (stock > threshold && product.low_stock_alert_sent_at) {
    const db = client || pool;
    await db.query(
      `UPDATE products SET low_stock_alert_sent_at = NULL WHERE id = $1`,
      [product.id]
    );
    return;
  }

  if (stock <= threshold && !product.low_stock_alert_sent_at) {
    const db = client || pool;
    await notifyAdmins(
      {
        type: 'low_stock',
        title: `Low stock: ${product.name}`,
        message: `Product "${product.name}" stock is ${stock} (threshold: ${threshold}).`,
        entityType: 'product',
        entityId: product.id,
      },
      db
    );
    await db.query(
      `UPDATE products SET low_stock_alert_sent_at = NOW() WHERE id = $1`,
      [product.id]
    );
  }
}

module.exports = { createNotification, notifyAdmins, checkLowStock };
