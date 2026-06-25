const { formatMoney } = require('../../utils/money');

const HEADER_FILL = '#D9EAF7';

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatRateLabel(rate) {
  const n = Number(rate);
  if (Number.isNaN(n)) return String(rate);
  return Number.isInteger(n) ? String(n) : String(n);
}

function formatQty(qty) {
  const n = Number(qty);
  if (Number.isNaN(n)) return String(qty);
  return n % 1 === 0 ? String(Math.floor(n)).padStart(2, '0') : formatMoney(n);
}

function formatDisplayMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value ?? '');
  if (n % 1 === 0) return String(Math.floor(n));
  return formatMoney(n);
}

function splitAddress(address) {
  if (!address) return [];
  const parts = String(address)
    .split(/\n|,\s*(?=Near\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((part, idx) => {
    if (idx === 0) return part;
    return part.replace(/Katraj\s*,/i, 'Katraj ,');
  });
}

function buildParty(invoice, type) {
  const isBilling = type === 'billing';
  return {
    name: invoice.customer_name,
    addressLines: splitAddress(isBilling ? invoice.billing_address : invoice.shipping_address),
    email: invoice.customer_email || '',
    contact: invoice.contact_person || '',
    mobile: invoice.customer_mobile || '',
  };
}

function partyLines(party) {
  return [
    `Name: ${party.name}`,
    ...party.addressLines,
    party.email ? `E-mail : ${party.email}` : '',
    party.contact ? `Contact – ${party.contact}` : '',
    party.mobile ? `MOB: - ${party.mobile}` : '',
  ].filter(Boolean);
}

function buildInvoiceViewModel(invoice, lineItems, orgSettings) {
  const isInterState = invoice.tax_type === 'inter_state';
  const gstRate = lineItems.length > 0 ? Number(lineItems[0].gst_percent) : 18;
  const halfRate = gstRate / 2;

  const tableLines = lineItems.map((line, idx) => ({
    srNo: idx + 1,
    productName: line.product_name,
    hsnSac: line.hsn_sac_code,
    qty: formatQty(line.quantity),
    unit: line.unit,
    rate: formatDisplayMoney(line.rate),
    taxableValue: formatDisplayMoney(line.taxable_value),
    sgstRate: isInterState ? '' : `${formatRateLabel(line.sgst_rate)}%`,
    sgstAmount: isInterState ? '' : formatDisplayMoney(line.sgst_amount),
    cgstRate: isInterState ? '' : `${formatRateLabel(line.cgst_rate)}%`,
    cgstAmount: isInterState ? '' : formatDisplayMoney(line.cgst_amount),
    igstRate: isInterState ? `${formatRateLabel(line.igst_rate)}%` : '',
    igstAmount: isInterState ? formatDisplayMoney(line.igst_amount) : '',
    total: formatDisplayMoney(line.line_total),
  }));

  const termsList = (invoice.terms_and_conditions || orgSettings.invoice_terms || '')
    .split('\n')
    .filter((t) => t.trim())
    .map((t, i) => `${i + 1}. ${t.replace(/^\d+\.\s*/, '')}`);

  const billedTo = buildParty(invoice, 'billing');
  const shippedTo = buildParty(invoice, 'shipping');
  const cgstRateLabel = formatRateLabel(halfRate);
  const sgstRateLabel = formatRateLabel(halfRate);
  const igstRateLabel = formatRateLabel(gstRate);

  return {
    headerFill: HEADER_FILL,
    topBanner: 'Thank-you for doing business with us',
    bottomBanner: 'Thankyou for your business',
    companyName: orgSettings.company_name || 'Company Name',
    companyAddress: orgSettings.address_line || '',
    companyGstin: orgSettings.gstin || '',
    companyStateCode: orgSettings.state_code || '',
    logoUrl: orgSettings.logo_url || null,
    signatureUrl: orgSettings.signature_url || null,
    title: 'TAX INVOICE',
    originalForRecipient: 'Original For Recipient',
    invoiceNumber: invoice.invoice_number,
    invoiceDate: formatDate(invoice.invoice_date),
    stateLabel: `${invoice.billing_state} ${invoice.billing_state_code}`.trim(),
    reverseCharge: invoice.reverse_charge ? 'Yes' : 'No',
    billedTo,
    shippedTo,
    billedToLines: partyLines(billedTo),
    shippedToLines: partyLines(shippedTo),
    isInterState,
    tableLines,
    totals: {
      subtotal: formatMoney(invoice.subtotal),
      cgstRate: cgstRateLabel,
      cgstAmount: formatMoney(invoice.cgst_total),
      sgstRate: sgstRateLabel,
      sgstAmount: formatMoney(invoice.sgst_total),
      igstRate: igstRateLabel,
      igstAmount: formatMoney(invoice.igst_total),
      totalTax: formatMoney(invoice.total_tax),
      finalAmount: formatMoney(invoice.final_amount),
    },
    amountInWords: invoice.amount_in_words,
    termsList,
    signatureBlock: {
      certification: 'Certified that the particular given above are true and correct',
      forCompany: `For, ${orgSettings.company_name || 'Company'}`,
      signatory: 'Authorised Signatory',
    },
    tableTotals: {
      taxableValue: formatDisplayMoney(invoice.subtotal),
      sgstAmount: isInterState ? '' : formatDisplayMoney(invoice.sgst_total),
      cgstAmount: isInterState ? '' : formatDisplayMoney(invoice.cgst_total),
      igstAmount: isInterState ? formatDisplayMoney(invoice.igst_total) : '',
      total: formatDisplayMoney(invoice.final_amount),
    },
  };
}

module.exports = { buildInvoiceViewModel, formatDate, HEADER_FILL };
