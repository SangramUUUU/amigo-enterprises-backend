function normalizePrefix(prefix) {
  const cleaned = String(prefix || 'AETX')
    .trim()
    .replace(/[-_\s]+$/g, '')
    .toUpperCase();
  return cleaned || 'AETX';
}

function formatInvoiceDateSegment(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInvoiceNumberPattern(prefix, invoiceDate) {
  const pfx = normalizePrefix(prefix);
  const dateSeg = formatInvoiceDateSegment(invoiceDate);
  return `${pfx}-${dateSeg}-`;
}

async function generateInvoiceNumber(client, prefix, invoiceDate) {
  const basePattern = buildInvoiceNumberPattern(prefix, invoiceDate);
  const db = client || require('../db/pool');
  const { rows } = await db.query(
    `SELECT invoice_number FROM invoices
     WHERE invoice_number LIKE $1
     ORDER BY invoice_number DESC`,
    [`${basePattern}%`]
  );

  let maxSeq = 0;
  const seqPattern = new RegExp(`^${escapeRegex(basePattern)}(\\d+)$`);
  for (const row of rows) {
    const match = row.invoice_number.match(seqPattern);
    if (match) {
      maxSeq = Math.max(maxSeq, Number(match[1]));
    }
  }

  const seq = String(maxSeq + 1).padStart(2, '0');
  return `${basePattern}${seq}`;
}

module.exports = {
  normalizePrefix,
  formatInvoiceDateSegment,
  buildInvoiceNumberPattern,
  generateInvoiceNumber,
};
