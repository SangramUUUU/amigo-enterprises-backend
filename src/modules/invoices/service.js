const pool = require('../../db/pool');
const { getOrgSettings } = require('../orgSettings/service');
const { generateInvoiceNumber } = require('../../utils/invoiceNumber');
const { getCustomer, listCustomers } = require('../customers/service');
const { getProduct, deductStock, listProducts } = require('../products/service');
const { determineTaxType, calculateInvoiceTotals } = require('../../utils/taxCalc');
const { amountInWords } = require('../../utils/amountInWords');
const { round2 } = require('../../utils/money');

async function listInvoices({ status, customerId, q }) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (status) {
    conditions.push(`i.status = $${idx++}`);
    values.push(status);
  }
  if (customerId) {
    conditions.push(`i.customer_id = $${idx++}`);
    values.push(customerId);
  }
  if (q) {
    conditions.push(`(i.invoice_number ILIKE $${idx} OR i.customer_name ILIKE $${idx})`);
    values.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS customer_current_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.invoice_date DESC, i.created_at DESC`,
    values
  );
  return rows;
}

async function getInvoice(id, client) {
  const db = client || pool;
  const { rows } = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) return null;
  const invoice = rows[0];
  const [lineItems, payments] = await Promise.all([
    db.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, id',
      [id]
    ),
    db.query(
      'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
      [id]
    ),
  ]);
  return { ...invoice, line_items: lineItems.rows, payments: payments.rows };
}

async function getInvoiceFormData(id) {
  const [invoice, customers, products] = await Promise.all([
    getInvoice(id),
    listCustomers({}),
    listProducts({}),
  ]);
  if (!invoice) return null;
  return { invoice, customers, products };
}

async function getNewInvoiceFormOptions() {
  const [customers, products] = await Promise.all([
    listCustomers({}),
    listProducts({}),
  ]);
  return { customers, products };
}

async function loadProductsByIds(productIds) {
  if (!productIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT id, name, hsn_sac_code, unit, rate, gst_percent
     FROM products WHERE id = ANY($1::uuid[])`,
    [productIds]
  );
  return new Map(rows.map((p) => [p.id, p]));
}

async function buildLineItemsFromInput(lines, taxType) {
  const idsToLoad = [
    ...new Set(
      lines
        .filter((line) => line.product_id && !line.product_name)
        .map((line) => line.product_id)
    ),
  ];
  const productMap = await loadProductsByIds(idsToLoad);

  const inputLines = lines.map((line) => {
    const product = line.product_id ? productMap.get(line.product_id) : null;
    return {
      product_id: line.product_id || null,
      product_name: line.product_name || product?.name || '',
      hsn_sac_code: line.hsn_sac_code || product?.hsn_sac_code || '',
      unit: line.unit || product?.unit || 'Nos',
      quantity: line.quantity ?? 1,
      rate: line.rate ?? product?.rate ?? 0,
      discount: line.discount ?? 0,
      gst_percent: line.gst_percent ?? product?.gst_percent ?? 18,
    };
  });
  const totals = calculateInvoiceTotals(inputLines, taxType);
  totals.lines = totals.lines.map((line, i) => ({
    ...line,
    product_id: inputLines[i].product_id,
    product_name: inputLines[i].product_name,
    hsn_sac_code: inputLines[i].hsn_sac_code,
    unit: inputLines[i].unit,
  }));
  return totals;
}

async function insertInvoiceLineItems(client, invoiceId, lines) {
  if (!lines.length) return;

  const values = [];
  const placeholders = lines.map((line, index) => {
    const offset = index * 18;
    values.push(
      invoiceId,
      line.product_id || null,
      line.product_name,
      line.hsn_sac_code,
      line.unit,
      line.quantity,
      line.rate,
      line.discount,
      line.gst_percent,
      line.taxable_value,
      line.cgst_rate,
      line.cgst_amount,
      line.sgst_rate,
      line.sgst_amount,
      line.igst_rate,
      line.igst_amount,
      line.line_total,
      index
    );
    const nums = Array.from({ length: 18 }, (_, j) => `$${offset + j + 1}`);
    return `(${nums.join(',')})`;
  });

  await client.query(
    `INSERT INTO invoice_line_items (
      invoice_id, product_id, product_name, hsn_sac_code, unit,
      quantity, rate, discount, gst_percent, taxable_value,
      cgst_rate, cgst_amount, sgst_rate, sgst_amount,
      igst_rate, igst_amount, line_total, sort_order
    ) VALUES ${placeholders.join(',')}`,
    values
  );
}

async function createInvoice(data, userId) {
  const customer = await getCustomer(data.customer_id);
  if (!customer || !customer.is_active) {
    const err = new Error('Customer not found');
    err.status = 404;
    throw err;
  }

  const org = await getOrgSettings({ includeAssets: false });
  const taxType = determineTaxType(customer.billing_state_code, org.state_code);
  const totals = await buildLineItemsFromInput(data.line_items || [], taxType);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const numberDate = data.invoice_date ? new Date(data.invoice_date) : new Date();
    const invoiceNumber = data.invoice_number
      || (await generateInvoiceNumber(client, org.invoice_number_prefix, numberDate));
    const terms = data.terms_and_conditions ?? org.invoice_terms ?? '';
    const finalAmount = totals.final_amount;
    const amountPaid = 0;
    const balanceDue = finalAmount;

    const { rows } = await client.query(
      `INSERT INTO invoices (
        invoice_number, customer_id, status, tax_type, reverse_charge,
        invoice_date, due_date,
        customer_name, customer_gstin, billing_address, billing_state, billing_state_code,
        shipping_address, shipping_state, shipping_state_code,
        customer_email, contact_person, customer_mobile,
        subtotal, cgst_total, sgst_total, igst_total, total_tax,
        final_amount, amount_in_words, amount_paid, balance_due,
        terms_and_conditions, source_job_id, created_by
      ) VALUES (
        $1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
      ) RETURNING *`,
      [
        invoiceNumber, customer.id, taxType, data.reverse_charge || false,
        data.invoice_date || new Date(), data.due_date || null,
        customer.name, customer.gstin, customer.billing_address,
        customer.billing_state, customer.billing_state_code,
        customer.shipping_address, customer.shipping_state, customer.shipping_state_code,
        customer.email, customer.contact_person, customer.mobile,
        totals.subtotal, totals.cgst_total, totals.sgst_total, totals.igst_total,
        totals.total_tax, finalAmount, amountInWords(finalAmount),
        amountPaid, balanceDue, terms, data.source_job_id || null, userId,
      ]
    );

    const invoice = rows[0];
    await insertInvoiceLineItems(client, invoice.id, totals.lines);

    await client.query('COMMIT');
    return getInvoice(invoice.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateInvoice(id, data, userRole) {
  if (userRole === 'employee') {
    const err = new Error('Employees cannot edit invoices');
    err.status = 403;
    throw err;
  }

  const existing = await getInvoice(id);
  if (!existing) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (['paid', 'cancelled'].includes(existing.status)) {
    const err = new Error('Cannot edit paid or cancelled invoices');
    err.status = 400;
    throw err;
  }

  let taxType = existing.tax_type;
  let totals = null;

  if (data.line_items) {
    const customerId = data.customer_id || existing.customer_id;
    const [customer, org] = await Promise.all([
      getCustomer(customerId),
      getOrgSettings({ includeAssets: false }),
    ]);
    taxType = determineTaxType(customer.billing_state_code, org.state_code);
    totals = await buildLineItemsFromInput(data.line_items, taxType);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (data.line_items) {
      await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [id]);
      await insertInvoiceLineItems(client, id, totals.lines);
    }

    const finalAmount = totals ? totals.final_amount : Number(existing.final_amount);
    const amountPaid = Number(existing.amount_paid);
    const balanceDue = round2(finalAmount - amountPaid);

    await client.query(
      `UPDATE invoices SET
        invoice_number = COALESCE($1, invoice_number),
        invoice_date = COALESCE($2, invoice_date),
        due_date = COALESCE($3, due_date),
        reverse_charge = COALESCE($4, reverse_charge),
        terms_and_conditions = COALESCE($5, terms_and_conditions),
        tax_type = $6,
        subtotal = COALESCE($7, subtotal),
        cgst_total = COALESCE($8, cgst_total),
        sgst_total = COALESCE($9, sgst_total),
        igst_total = COALESCE($10, igst_total),
        total_tax = COALESCE($11, total_tax),
        final_amount = $12,
        amount_in_words = $13,
        balance_due = $14,
        updated_at = NOW()
       WHERE id = $15`,
      [
        data.invoice_number,
        data.invoice_date,
        data.due_date,
        data.reverse_charge,
        data.terms_and_conditions,
        taxType,
        totals?.subtotal,
        totals?.cgst_total,
        totals?.sgst_total,
        totals?.igst_total,
        totals?.total_tax,
        finalAmount,
        amountInWords(finalAmount),
        balanceDue,
        id,
      ]
    );

    await client.query('COMMIT');

    let lineItems = existing.line_items;
    if (data.line_items) {
      const { rows } = await client.query(
        'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, id',
        [id]
      );
      lineItems = rows;
    }

    return {
      ...existing,
      customer_id: data.customer_id ?? existing.customer_id,
      due_date: data.due_date !== undefined ? data.due_date : existing.due_date,
      tax_type: taxType,
      subtotal: totals?.subtotal ?? existing.subtotal,
      cgst_total: totals?.cgst_total ?? existing.cgst_total,
      sgst_total: totals?.sgst_total ?? existing.sgst_total,
      igst_total: totals?.igst_total ?? existing.igst_total,
      total_tax: totals?.total_tax ?? existing.total_tax,
      final_amount: finalAmount,
      amount_in_words: amountInWords(finalAmount),
      balance_due: balanceDue,
      line_items: lineItems,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function finalizeInvoice(id, userRole) {
  if (userRole === 'employee') {
    const err = new Error('Employees cannot finalize invoices');
    err.status = 403;
    throw err;
  }

  const invoice = await getInvoice(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (invoice.status !== 'draft') {
    const err = new Error('Only draft invoices can be finalized');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const line of invoice.line_items) {
      if (line.product_id) {
        const product = await getProduct(line.product_id, client);
        if (product?.product_type === 'physical_item') {
          await deductStock(line.product_id, line.quantity, client);
        }
      }
    }

    await client.query(
      `UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    return getInvoice(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function cancelInvoice(id, userRole) {
  if (userRole === 'employee') {
    const err = new Error('Employees cannot cancel invoices');
    err.status = 403;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (rows.length === 0) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  return getInvoice(id);
}

function computePaymentStatus(finalAmount, amountPaid) {
  if (amountPaid <= 0) return 'sent';
  if (amountPaid >= finalAmount) return 'paid';
  return 'partially_paid';
}

async function addPayment(id, data, userRole) {
  if (userRole === 'employee') {
    const err = new Error('Employees cannot record payments');
    err.status = 403;
    throw err;
  }

  const invoice = await getInvoice(id);
  if (!invoice) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (invoice.status === 'cancelled' || invoice.status === 'draft') {
    const err = new Error('Cannot add payment to draft or cancelled invoice');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO invoice_payments (invoice_id, payment_date, amount, payment_mode, reference_no, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        data.payment_date || new Date(),
        data.amount,
        data.payment_mode || 'cash',
        data.reference_no || null,
        data.notes || null,
      ]
    );

    const amountPaid = round2(Number(invoice.amount_paid) + Number(data.amount));
    const finalAmount = Number(invoice.final_amount);
    const balanceDue = round2(Math.max(0, finalAmount - amountPaid));
    const status = computePaymentStatus(finalAmount, amountPaid);

    await client.query(
      `UPDATE invoices SET amount_paid = $1, balance_due = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [amountPaid, balanceDue, status, id]
    );

    await client.query('COMMIT');
    return getInvoice(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteInvoice(id, userRole) {
  if (userRole === 'employee') {
    const err = new Error('Employees cannot delete invoices');
    err.status = 403;
    throw err;
  }

  const existing = await getInvoice(id);
  if (!existing) {
    const err = new Error('Invoice not found');
    err.status = 404;
    throw err;
  }
  if (existing.status !== 'draft') {
    const err = new Error('Only draft invoices can be deleted. Cancel finalized invoices instead.');
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [id]);
    await client.query('DELETE FROM invoice_payments WHERE invoice_id = $1', [id]);
    await client.query('DELETE FROM invoices WHERE id = $1', [id]);
    await client.query('COMMIT');
    return { id, invoice_number: existing.invoice_number };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listInvoices,
  getInvoice,
  getInvoiceFormData,
  getNewInvoiceFormOptions,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
  cancelInvoice,
  deleteInvoice,
  addPayment,
};
