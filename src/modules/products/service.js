const pool = require('../../db/pool');
const { checkLowStock } = require('../notifications/service');

async function listProducts({ q, includeInactive, productType }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (!includeInactive) conditions.push('is_active = true');
  if (productType) {
    conditions.push(`product_type = $${idx++}`);
    values.push(productType);
  }
  if (q) {
    conditions.push(`(name ILIKE $${idx} OR hsn_sac_code ILIKE $${idx} OR category ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM products ${where} ORDER BY name ASC`,
    values
  );
  return rows;
}

async function getProduct(id, client) {
  const db = client || pool;
  const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createProduct(data) {
  const { rows } = await pool.query(
    `INSERT INTO products (
      name, product_type, hsn_sac_code, unit, rate, gst_percent, category,
      stock_quantity, low_stock_threshold
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.name,
      data.product_type || 'physical_item',
      data.hsn_sac_code || '',
      data.unit || 'Nos',
      data.rate || 0,
      data.gst_percent ?? 18,
      data.category || null,
      data.product_type === 'service' ? 0 : (data.stock_quantity || 0),
      data.low_stock_threshold ?? null,
    ]
  );
  const product = rows[0];
  if (product.product_type === 'physical_item') {
    await checkLowStock(product);
  }
  return product;
}

async function updateProduct(id, data) {
  const existing = await getProduct(id);
  if (!existing) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }

  const productType = data.product_type ?? existing.product_type;
  const { rows } = await pool.query(
    `UPDATE products SET
      name = $1, product_type = $2, hsn_sac_code = $3, unit = $4, rate = $5,
      gst_percent = $6, category = $7, stock_quantity = $8,
      low_stock_threshold = $9, updated_at = NOW()
     WHERE id = $10 RETURNING *`,
    [
      data.name ?? existing.name,
      productType,
      data.hsn_sac_code ?? existing.hsn_sac_code,
      data.unit ?? existing.unit,
      data.rate ?? existing.rate,
      data.gst_percent ?? existing.gst_percent,
      data.category ?? existing.category,
      productType === 'service' ? 0 : (data.stock_quantity ?? existing.stock_quantity),
      data.low_stock_threshold !== undefined ? data.low_stock_threshold : existing.low_stock_threshold,
      id,
    ]
  );
  const product = rows[0];
  if (product.product_type === 'physical_item') {
    await checkLowStock(product);
  }
  return product;
}

async function softDeleteProduct(id) {
  const { rows } = await pool.query(
    `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('Product not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

async function adjustStock(productId, userId, { reason, quantity_change, notes }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = await getProduct(productId, client);
    if (!product) {
      const err = new Error('Product not found');
      err.status = 404;
      throw err;
    }
    if (product.product_type !== 'physical_item') {
      const err = new Error('Stock adjustments only apply to physical items');
      err.status = 400;
      throw err;
    }

    await client.query(
      `INSERT INTO stock_adjustments (product_id, user_id, reason, quantity_change, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [productId, userId, reason, quantity_change, notes || null]
    );

    const { rows } = await client.query(
      `UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [quantity_change, productId]
    );

    await client.query('COMMIT');
    await checkLowStock(rows[0], client);
    return { product: rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deductStock(productId, quantity, client) {
  const product = await getProduct(productId, client);
  if (!product || product.product_type !== 'physical_item') return;
  const { rows } = await client.query(
    `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [quantity, productId]
  );
  if (rows[0]) await checkLowStock(rows[0], client);
}

async function listStockAdjustments(productId) {
  const { rows } = await pool.query(
    `SELECT sa.*, u.name AS user_name FROM stock_adjustments sa
     JOIN users u ON u.id = sa.user_id
     WHERE sa.product_id = $1 ORDER BY sa.created_at DESC`,
    [productId]
  );
  return rows;
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  softDeleteProduct,
  adjustStock,
  deductStock,
  listStockAdjustments,
};
