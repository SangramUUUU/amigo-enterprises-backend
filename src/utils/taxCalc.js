const { round2 } = require('./money');

function determineTaxType(customerBillingStateCode, orgStateCode) {
  if (
    String(customerBillingStateCode).trim() === String(orgStateCode).trim()
  ) {
    return 'intra_state';
  }
  return 'inter_state';
}

function calculateLineTax(line, taxType) {
  const quantity = Number(line.quantity) || 0;
  const rate = Number(line.rate) || 0;
  const discount = Number(line.discount) || 0;
  const gstPercent = Number(line.gst_percent ?? line.gstPercent ?? 18);

  const taxableValue = round2(quantity * rate - discount);

  const result = {
    quantity,
    rate,
    discount,
    gst_percent: gstPercent,
    taxable_value: taxableValue,
    cgst_rate: 0,
    cgst_amount: 0,
    sgst_rate: 0,
    sgst_amount: 0,
    igst_rate: 0,
    igst_amount: 0,
    line_total: taxableValue,
  };

  if (taxType === 'intra_state') {
    const halfRate = round2(gstPercent / 2);
    const cgstAmount = round2((taxableValue * halfRate) / 100);
    const sgstAmount = round2((taxableValue * halfRate) / 100);
    result.cgst_rate = halfRate;
    result.sgst_rate = halfRate;
    result.cgst_amount = cgstAmount;
    result.sgst_amount = sgstAmount;
    result.line_total = round2(taxableValue + cgstAmount + sgstAmount);
  } else {
    const igstAmount = round2((taxableValue * gstPercent) / 100);
    result.igst_rate = gstPercent;
    result.igst_amount = igstAmount;
    result.line_total = round2(taxableValue + igstAmount);
  }

  return result;
}

function calculateInvoiceTotals(lines, taxType) {
  const computedLines = lines.map((line) => calculateLineTax(line, taxType));

  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  for (const line of computedLines) {
    subtotal = round2(subtotal + line.taxable_value);
    cgstTotal = round2(cgstTotal + line.cgst_amount);
    sgstTotal = round2(sgstTotal + line.sgst_amount);
    igstTotal = round2(igstTotal + line.igst_amount);
  }

  const totalTax = round2(cgstTotal + sgstTotal + igstTotal);
  const finalAmount = round2(subtotal + totalTax);

  return {
    lines: computedLines,
    subtotal,
    cgst_total: cgstTotal,
    sgst_total: sgstTotal,
    igst_total: igstTotal,
    total_tax: totalTax,
    final_amount: finalAmount,
  };
}

module.exports = {
  determineTaxType,
  calculateLineTax,
  calculateInvoiceTotals,
};
