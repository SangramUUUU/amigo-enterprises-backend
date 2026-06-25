const { normalizePrefix } = require('./invoiceNumber');

function formatExportDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function buildInvoiceExportFilename({ prefix, invoiceDate, customerName, extension }) {
  const pfx = normalizePrefix(prefix);
  const date = formatExportDate(invoiceDate || new Date());
  const customer = String(customerName || 'CUSTOMER').trim().replace(/\s+/g, ' ');
  const raw = `${pfx}_${date}_${customer}`;
  const safe = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return `${safe}.${extension}`;
}

function contentDispositionAttachment(filename) {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`;
}

module.exports = { buildInvoiceExportFilename, formatExportDate, contentDispositionAttachment };
