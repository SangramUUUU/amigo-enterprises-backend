const fs = require('fs');
const path = require('path');
const { buildInvoiceViewModel } = require('../modules/invoices/invoiceViewModel');
const { renderInvoicePdf } = require('../modules/invoices/pdfRenderer');

// Data aligned with docs/AETX-26-27-08-ELECTROMECH ENTERPRISES.pdf
const sampleOrg = {
  company_name: 'AMIGO ENTERPRISES',
  address_line: 'S.NO.6/17 FLAT NO 401 CHOVISAWADI Pimpri Chinchwad, Pune, Maharashtra, 412105',
  state: 'Maharashtra',
  state_code: '27',
  gstin: '27ACBFA5336L1ZB',
  email: '',
  phone: '',
  logo_url: null,
  signature_url: null,
  bank_details: '',
  invoice_terms: 'This is an electronically generated document.\nAll disputes are subject to Pune jurisdiction.',
};

const sampleInvoice = {
  invoice_number: 'AETX-04-06-2026-01',
  invoice_date: '2026-06-04',
  tax_type: 'intra_state',
  reverse_charge: false,
  billing_state: 'Maharashtra',
  billing_state_code: '27',
  customer_name: 'Electromech Enterprises',
  billing_address: 'Flat no-102, Savali Enclave, opposite of lake side society, Near katraj lake, Katraj, Pune-411046(MH)',
  shipping_address: 'Flat no-102, Savali Enclave, opposite of lake side society, Near katraj lake, Katraj, Pune-411046(MH)',
  customer_email: 'electromechenterprises20@gmail.com',
  contact_person: 'Parag Rajput',
  customer_mobile: '8887586630',
  subtotal: 650000,
  cgst_total: 58500,
  sgst_total: 58500,
  igst_total: 0,
  total_tax: 117000,
  final_amount: 767000,
  amount_in_words: 'SEVEN LAKH SIXY SEVEN THOUSAND RUPEES ONLY',
  terms_and_conditions: sampleOrg.invoice_terms,
};

const sampleLines = [
  {
    product_name: 'Precicon R+ controller, Make - Ador',
    hsn_sac_code: '8421',
    unit: 'Nos',
    quantity: 3,
    rate: 135000,
    gst_percent: 18,
    taxable_value: 405000,
    sgst_rate: 9,
    sgst_amount: 36450,
    cgst_rate: 9,
    cgst_amount: 36450,
    line_total: 477900,
  },
  {
    product_name: 'Precicon R controller retrofik kit with installation',
    hsn_sac_code: '8421',
    unit: 'Nos',
    quantity: 1,
    rate: 245000,
    gst_percent: 18,
    taxable_value: 245000,
    sgst_rate: 9,
    sgst_amount: 22050,
    cgst_rate: 9,
    cgst_amount: 22050,
    line_total: 289100,
  },
];

async function main() {
  const vm = buildInvoiceViewModel(sampleInvoice, sampleLines, sampleOrg);
  const pdf = await renderInvoicePdf(vm);
  const outDir = path.join(__dirname, '../../../docs');
  const outPath = path.join(outDir, 'sample-invoice-test.pdf');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, pdf);
  console.log('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
