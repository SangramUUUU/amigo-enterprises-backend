const pool = require('../../db/pool');

async function getStats() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM customers WHERE is_active = true) AS customers,
      (SELECT COUNT(*)::int FROM products WHERE is_active = true) AS products,
      (SELECT COUNT(*)::int FROM invoices) AS invoices,
      (SELECT COUNT(*)::int FROM service_jobs) AS jobs
  `);
  return rows[0];
}

module.exports = { getStats };
