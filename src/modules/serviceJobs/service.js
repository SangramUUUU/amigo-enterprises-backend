const pool = require('../../db/pool');
const { createInvoice } = require('../invoices/service');
const { getProduct } = require('../products/service');

async function listJobs({ status, customerId, assignedTo, q }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (status) {
    conditions.push(`sj.status = $${idx++}`);
    values.push(status);
  }
  if (customerId) {
    conditions.push(`sj.customer_id = $${idx++}`);
    values.push(customerId);
  }
  if (assignedTo) {
    conditions.push(`sj.assigned_to = $${idx++}`);
    values.push(assignedTo);
  }
  if (q) {
    conditions.push(`(sj.job_number ILIKE $${idx} OR c.name ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT sj.*, c.name AS customer_name, u.name AS assigned_to_name
     FROM service_jobs sj
     JOIN customers c ON c.id = sj.customer_id
     LEFT JOIN users u ON u.id = sj.assigned_to
     ${where}
     ORDER BY sj.scheduled_date DESC NULLS LAST, sj.created_at DESC`,
    values
  );
  return rows;
}

async function getJob(id, client) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT sj.*, c.name AS customer_name, u.name AS assigned_to_name
     FROM service_jobs sj
     JOIN customers c ON c.id = sj.customer_id
     LEFT JOIN users u ON u.id = sj.assigned_to
     WHERE sj.id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const job = rows[0];
  const { rows: lineItems } = await db.query(
    'SELECT * FROM job_line_items WHERE job_id = $1 ORDER BY sort_order, id',
    [id]
  );
  return { ...job, line_items: lineItems };
}

async function generateJobNumber() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM service_jobs');
  return `JOB-${String(rows[0].cnt + 1).padStart(4, '0')}`;
}

async function createJob(data, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobNumber = data.job_number || (await generateJobNumber());

    const { rows } = await client.query(
      `INSERT INTO service_jobs (
        job_number, customer_id, site_location, job_type, amc_contract_id,
        assigned_to, scheduled_date, status, description, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        jobNumber, data.customer_id, data.site_location || '',
        data.job_type || 'maintenance', data.amc_contract_id || null,
        data.assigned_to || null, data.scheduled_date || null,
        data.status || 'scheduled', data.description || null, userId,
      ]
    );

    const job = rows[0];
    if (data.line_items?.length) {
      let sortOrder = 0;
      for (const line of data.line_items) {
        await client.query(
          `INSERT INTO job_line_items (job_id, product_id, description, quantity, rate, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            job.id, line.product_id || null,
            line.description || '', line.quantity ?? 1,
            line.rate ?? 0, sortOrder++,
          ]
        );
      }
    }

    await client.query('COMMIT');
    return getJob(job.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateJob(id, data) {
  const existing = await getJob(id);
  if (!existing) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE service_jobs SET
        site_location = COALESCE($1, site_location),
        job_type = COALESCE($2, job_type),
        amc_contract_id = COALESCE($3, amc_contract_id),
        assigned_to = COALESCE($4, assigned_to),
        scheduled_date = COALESCE($5, scheduled_date),
        status = COALESCE($6, status),
        description = COALESCE($7, description),
        updated_at = NOW()
       WHERE id = $8`,
      [
        data.site_location, data.job_type, data.amc_contract_id,
        data.assigned_to, data.scheduled_date, data.status,
        data.description, id,
      ]
    );

    if (data.line_items) {
      await client.query('DELETE FROM job_line_items WHERE job_id = $1', [id]);
      let sortOrder = 0;
      for (const line of data.line_items) {
        await client.query(
          `INSERT INTO job_line_items (job_id, product_id, description, quantity, rate, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id, line.product_id || null, line.description || '',
            line.quantity ?? 1, line.rate ?? 0, sortOrder++,
          ]
        );
      }
    }

    await client.query('COMMIT');
    return getJob(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function completeJob(id, completedDate) {
  const { rows } = await pool.query(
    `UPDATE service_jobs SET status = 'completed', completed_date = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [completedDate || new Date(), id]
  );
  if (rows.length === 0) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return getJob(id);
}

async function generateInvoiceFromJob(id, userId) {
  const job = await getJob(id);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  if (job.status !== 'completed') {
    const err = new Error('Job must be completed before generating invoice');
    err.status = 400;
    throw err;
  }
  if (job.generated_invoice_id) {
    const err = new Error('Invoice already generated for this job');
    err.status = 400;
    throw err;
  }

  const lineItems = [];
  for (const line of job.line_items) {
    let product = null;
    if (line.product_id) product = await getProduct(line.product_id);
    lineItems.push({
      product_id: line.product_id,
      product_name: product?.name || line.description,
      quantity: line.quantity,
      rate: line.rate,
      gst_percent: product?.gst_percent ?? 18,
      hsn_sac_code: product?.hsn_sac_code,
      unit: product?.unit,
    });
  }

  const invoice = await createInvoice(
    { customer_id: job.customer_id, line_items: lineItems, source_job_id: job.id },
    userId
  );

  await pool.query(
    `UPDATE service_jobs SET generated_invoice_id = $1, updated_at = NOW() WHERE id = $2`,
    [invoice.id, id]
  );

  return getJob(id);
}

module.exports = {
  listJobs,
  getJob,
  createJob,
  updateJob,
  completeJob,
  generateInvoiceFromJob,
};
