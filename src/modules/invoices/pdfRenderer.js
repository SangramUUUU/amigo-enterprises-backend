const PDFDocument = require('pdfkit');
const { parseDataUrl } = require('../../utils/imageData');
const { HEADER_FILL } = require('./invoiceViewModel');

const PAGE_MARGIN = 28;
const OUTER = PAGE_MARGIN;
const INNER = PAGE_MARGIN + 1;
const INNER_W = 539;
const HALF_W = Math.floor(INNER_W / 2);
const HALF_W2 = INNER_W - HALF_W;
const META_LABEL_W = 200;
const META_VALUE_W = INNER_W - META_LABEL_W;
const ROW_H = 18;
const DATA_ROW_H = 20;
const INTRA_WIDTHS = [18, 178, 32, 24, 24, 40, 48, 28, 32, 28, 32, 55];
const EMAIL_COLOR = '#1565C0';

function colX(widths, startCol) {
  let x = INNER;
  for (let i = 0; i < startCol; i++) x += widths[i];
  return x;
}

function colWidth(widths, startCol, count = 1) {
  return widths.slice(startCol, startCol + count).reduce((a, b) => a + b, 0);
}

function setFont(doc, opts = {}) {
  doc.font(opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica')
    .fontSize(opts.size || 8)
    .fillColor(opts.color || '#000000');
}

function textBlockHeight(doc, text, width, opts = {}) {
  setFont(doc, opts);
  return doc.heightOfString(String(text ?? ''), {
    width,
    align: opts.align || 'left',
    lineGap: opts.lineGap ?? 0,
  });
}

function drawTextInBox(doc, text, x, y, w, h, opts = {}) {
  setFont(doc, opts);
  const pad = opts.pad ?? 3;
  const innerW = w - pad * 2;
  const content = String(text ?? '');
  const textH = textBlockHeight(doc, content, innerW, opts);
  let ty = y + pad;
  if (opts.valign === 'center') {
    ty = y + Math.max(pad, (h - textH) / 2);
  } else if (opts.valign === 'bottom') {
    ty = y + h - textH - pad;
  }
  doc.text(content, x + pad, ty, {
    width: innerW,
    align: opts.align || 'left',
    lineGap: opts.lineGap ?? 0,
  });
}

function fillRect(doc, x, y, w, h, color) {
  doc.save();
  doc.rect(x, y, w, h).fill(color);
  doc.restore();
}

function strokeRect(doc, x, y, w, h) {
  doc.lineWidth(0.75);
  doc.rect(x, y, w, h).stroke();
}

function drawCell(doc, x, y, w, h, text, opts = {}) {
  if (opts.fill) fillRect(doc, x, y, w, h, opts.fill);
  strokeRect(doc, x, y, w, h);
  drawTextInBox(doc, text, x, y, w, h, {
    ...opts,
    valign: opts.valign || 'center',
    size: opts.size || 7,
  });
}

function tryDrawImage(doc, dataUrl, x, y, maxW, maxH) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return false;
  try {
    doc.image(parsed.buffer, x, y, { fit: [maxW, maxH], align: 'center', valign: 'center' });
    return true;
  } catch {
    return false;
  }
}

function drawPartyBlock(doc, x, y, w, h, party) {
  strokeRect(doc, x, y, w, h);
  const padX = 6;
  const textW = w - padX * 2;
  let cy = y + 5;

  setFont(doc, { size: 7.5 });
  doc.text('Name: ', x + padX, cy, { width: textW, continued: true, lineGap: 0 });
  doc.font('Helvetica-Bold').text(party.name, { continued: false });
  cy = doc.y + 1;

  for (const line of party.addressLines) {
    setFont(doc, { size: 7.5, color: '#000000' });
    doc.text(line, x + padX, cy, { width: textW, lineGap: 0 });
    cy = doc.y + 0.5;
  }

  if (party.email) {
    setFont(doc, { size: 7.5, color: '#000000' });
    doc.text('E-mail : ', x + padX, cy, { width: textW, continued: true });
    doc.fillColor(EMAIL_COLOR).text(party.email, { continued: false });
    cy = doc.y + 0.5;
  }

  if (party.contact) {
    setFont(doc, { size: 7.5, color: '#000000' });
    doc.text(`Contact – ${party.contact}`, x + padX, cy, { width: textW });
    cy = doc.y + 0.5;
  }

  if (party.mobile) {
    setFont(doc, { size: 7.5, color: '#000000' });
    doc.text(`MOB: - ${party.mobile}`, x + padX, cy, { width: textW });
  }
}

function drawMetaRows(doc, y, vm) {
  const rows = [
    ['Invoice Number', vm.invoiceNumber],
    ['Invoice Date', vm.invoiceDate],
    ['State', vm.stateLabel],
    ['Reverse Charge', vm.reverseCharge],
  ];

  for (const [label, value] of rows) {
    drawCell(doc, INNER, y, META_LABEL_W, ROW_H, label, { bold: true, size: 8, align: 'left' });
    drawCell(doc, INNER + META_LABEL_W, y, META_VALUE_W, ROW_H, value, { align: 'right', size: 8 });
    y += ROW_H;
  }
  return y;
}

function drawTotalsBand(doc, y, vm) {
  const summaryW = 218;
  const wordsW = INNER_W - summaryW;
  const summaryRows = vm.isInterState
    ? [
      { label: 'Total Amount Before Tax', value: vm.totals.subtotal, shade: true },
      { label: `Add : IGST ${vm.totals.igstRate}%`, value: vm.totals.igstAmount },
      { label: 'Total Tax Amount', value: vm.totals.totalTax, shade: true },
      { label: 'Final Invoice Amount', value: vm.totals.finalAmount, shade: true, bold: true },
    ]
    : [
      { label: 'Total Amount Before Tax', value: vm.totals.subtotal, shade: true },
      { label: `Add : CGST ${vm.totals.cgstRate}%`, value: vm.totals.cgstAmount },
      { label: `SGST ${vm.totals.sgstRate}%`, value: vm.totals.sgstAmount },
      { label: 'Total Tax Amount', value: vm.totals.totalTax, shade: true },
      { label: 'Final Invoice Amount', value: vm.totals.finalAmount, shade: true, bold: true },
    ];

  const bandH = summaryRows.length * ROW_H;

  strokeRect(doc, INNER, y, wordsW, bandH);
  drawTextInBox(doc, 'Total Invoice Amount in words', INNER, y + 4, wordsW, 16, {
    bold: true, size: 8, valign: 'top', pad: 6,
  });
  drawTextInBox(doc, vm.amountInWords, INNER, y + 20, wordsW, bandH - 24, {
    bold: true, size: 8, valign: 'top', pad: 6,
  });

  const sx = INNER + wordsW;
  const labelW = 128;
  const valueW = summaryW - labelW;

  let sy = y;
  for (const row of summaryRows) {
    const fill = row.shade ? HEADER_FILL : undefined;
    drawCell(doc, sx, sy, labelW, ROW_H, row.label, { fill, bold: !!row.bold, size: 7.5 });
    drawCell(doc, sx + labelW, sy, valueW, ROW_H, row.value, {
      fill, bold: !!row.bold, align: 'right', size: 7.5,
    });
    sy += ROW_H;
  }

  return y + bandH;
}

function drawSignatureBlock(doc, boxY, footerH, vm) {
  const boxX = INNER + HALF_W;
  const boxW = HALF_W2;

  drawTextInBox(doc, vm.signatureBlock.certification, boxX, boxY + 4, boxW, 24, {
    align: 'center', size: 7.5, valign: 'center',
  });
  drawTextInBox(doc, vm.signatureBlock.forCompany, boxX, boxY + 28, boxW, 18, {
    align: 'right', size: 8, bold: true, valign: 'center', pad: 8,
  });

  if (vm.signatureUrl) {
    tryDrawImage(doc, vm.signatureUrl, boxX + (boxW - 90) / 2, boxY + 46, 90, 52);
  }

  drawTextInBox(doc, vm.signatureBlock.signatory, boxX, boxY + footerH - 20, boxW, 18, {
    align: 'right', size: 7.5, valign: 'center', pad: 8,
  });
}

function cellAlign(colIndex) {
  if (colIndex === 0 || colIndex === 2 || colIndex === 3 || colIndex === 4) return 'center';
  if (colIndex === 1) return 'left';
  return 'right';
}

function measureDataRowHeight(doc, line, widths) {
  const productH = textBlockHeight(doc, line.productName, widths[1] - 6, { size: 6.5 }) + 8;
  return Math.max(DATA_ROW_H, productH);
}

function renderIntraTable(doc, y, vm) {
  const widths = INTRA_WIDTHS;
  const headerH1 = 20;
  const headerH2 = 16;
  const headerH = headerH1 + headerH2;
  const taxableIdx = 6;

  const baseLabels = ['Sr.\nNo.', 'Name of\nProduct', 'HSN/\nSAC', 'QTY', 'Unit', 'Rate/\nunit', 'Taxable\nValue'];
  for (let i = 0; i < 7; i++) {
    drawCell(doc, colX(widths, i), y, widths[i], headerH, baseLabels[i], {
      bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
    });
  }

  drawCell(doc, colX(widths, 7), y, colWidth(widths, 7, 2), headerH1, 'SGST', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 7,
  });
  drawCell(doc, colX(widths, 9), y, colWidth(widths, 9, 2), headerH1, 'CGST', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 7,
  });
  drawCell(doc, colX(widths, 11), y, widths[11], headerH, 'Total', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
  });

  drawCell(doc, colX(widths, 7), y + headerH1, widths[7], headerH2, 'Rate', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
  });
  drawCell(doc, colX(widths, 8), y + headerH1, widths[8], headerH2, 'Amount', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
  });
  drawCell(doc, colX(widths, 9), y + headerH1, widths[9], headerH2, 'Rate', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
  });
  drawCell(doc, colX(widths, 10), y + headerH1, widths[10], headerH2, 'Amount', {
    bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
  });

  y += headerH;

  for (const line of vm.tableLines) {
    const rowH = measureDataRowHeight(doc, line, widths);
    const cells = [
      line.srNo, line.productName, line.hsnSac, line.qty, line.unit, line.rate,
      line.taxableValue, line.sgstRate, line.sgstAmount, line.cgstRate, line.cgstAmount, line.total,
    ];
    for (let i = 0; i < cells.length; i++) {
      drawCell(doc, colX(widths, i), y, widths[i], rowH, String(cells[i]), {
        size: 6.5,
        align: cellAlign(i),
        fill: i === taxableIdx ? HEADER_FILL : undefined,
      });
    }
    y += rowH;
  }

  const mergeW = colWidth(widths, 0, 6);
  drawCell(doc, INNER, y, mergeW, ROW_H, 'Total', {
    bold: true, fill: HEADER_FILL, size: 6.5, align: 'center',
  });

  const totalCells = [
    { col: 6, val: vm.tableTotals.taxableValue },
    { col: 7, val: '' },
    { col: 8, val: vm.tableTotals.sgstAmount },
    { col: 9, val: '' },
    { col: 10, val: vm.tableTotals.cgstAmount },
    { col: 11, val: vm.tableTotals.total },
  ];
  for (const { col, val } of totalCells) {
    drawCell(doc, colX(widths, col), y, widths[col], ROW_H, String(val || ''), {
      bold: col === 11,
      fill: col === taxableIdx ? HEADER_FILL : undefined,
      align: 'right',
      size: 6.5,
    });
  }

  return y + ROW_H;
}

function renderInterTable(doc, y, vm) {
  const widths = [18, 210, 32, 24, 24, 40, 48, 36, 44, 59];
  const headerH = 28;
  const taxableIdx = 6;
  const headers = ['Sr.\nNo.', 'Name of\nProduct', 'HSN/\nSAC', 'QTY', 'Unit', 'Rate/\nunit', 'Taxable\nValue', 'IGST\nRate', 'IGST\nAmount', 'Total'];

  for (let i = 0; i < headers.length; i++) {
    drawCell(doc, colX(widths, i), y, widths[i], headerH, headers[i], {
      bold: true, fill: HEADER_FILL, align: 'center', size: 6.5,
    });
  }
  y += headerH;

  for (const line of vm.tableLines) {
    const cells = [
      line.srNo, line.productName, line.hsnSac, line.qty, line.unit, line.rate,
      line.taxableValue, line.igstRate, line.igstAmount, line.total,
    ];
    let rowH = DATA_ROW_H;
    rowH = Math.max(rowH, textBlockHeight(doc, line.productName, widths[1] - 6, { size: 6.5 }) + 8);
    for (let i = 0; i < cells.length; i++) {
      drawCell(doc, colX(widths, i), y, widths[i], rowH, String(cells[i]), {
        size: 6.5,
        align: cellAlign(i),
        fill: i === taxableIdx ? HEADER_FILL : undefined,
      });
    }
    y += rowH;
  }

  const mergeW = colWidth(widths, 0, 6);
  drawCell(doc, INNER, y, mergeW, ROW_H, 'Total', { bold: true, fill: HEADER_FILL, align: 'center' });
  const totalCells = [
    { col: 6, val: vm.tableTotals.taxableValue },
    { col: 7, val: '' },
    { col: 8, val: vm.tableTotals.igstAmount },
    { col: 9, val: vm.tableTotals.total },
  ];
  for (const { col, val } of totalCells) {
    drawCell(doc, colX(widths, col), y, widths[col], ROW_H, String(val || ''), {
      bold: col === 9,
      fill: col === taxableIdx ? HEADER_FILL : undefined,
      align: 'right',
      size: 6.5,
    });
  }
  return y + ROW_H;
}

function renderInvoicePdf(viewModel) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = PAGE_MARGIN + 4;

    drawTextInBox(doc, viewModel.topBanner, OUTER, y, INNER_W, 12, {
      align: 'center', italic: true, size: 9, valign: 'center',
    });
    y += 12;

    if (viewModel.logoUrl) {
      tryDrawImage(doc, viewModel.logoUrl, OUTER + (INNER_W - 56) / 2, y, 56, 56);
      y += 60;
    }

    drawTextInBox(doc, viewModel.companyName, OUTER, y, INNER_W, 16, {
      align: 'center', bold: true, size: 14, valign: 'center',
    });
    y += 16;

    if (viewModel.companyAddress) {
      drawTextInBox(doc, viewModel.companyAddress, OUTER, y, INNER_W, 14, {
        align: 'center', size: 7.5, valign: 'center',
      });
      y += 14;
    }

    const gstRowH = 16;
    const stateBoxW = 102;
    strokeRect(doc, INNER + INNER_W - stateBoxW, y, stateBoxW, gstRowH);
    drawTextInBox(
      doc,
      `State Code : ${viewModel.companyStateCode}`,
      INNER + INNER_W - stateBoxW,
      y,
      stateBoxW,
      gstRowH,
      { align: 'center', size: 8, valign: 'center' }
    );
    drawTextInBox(
      doc,
      `GSTIN : ${viewModel.companyGstin}`,
      INNER,
      y,
      INNER_W - stateBoxW,
      gstRowH,
      { align: 'left', size: 8, valign: 'center', pad: 6 }
    );
    y += gstRowH + 2;

    fillRect(doc, INNER, y, INNER_W, 18, HEADER_FILL);
    strokeRect(doc, INNER, y, INNER_W, 18);
    drawTextInBox(doc, viewModel.title, INNER, y, INNER_W, 18, {
      align: 'center', bold: true, size: 11, valign: 'center',
    });
    drawTextInBox(doc, viewModel.originalForRecipient, INNER + INNER_W - 145, y, 135, 18, {
      align: 'right', size: 7.5, italic: true, valign: 'center',
    });
    y += 18;

    y = drawMetaRows(doc, y, viewModel);

    drawCell(doc, INNER, y, HALF_W, 15, 'Details of Receiver | Billed to', {
      fill: HEADER_FILL, bold: true, size: 7.5, align: 'left', pad: 5,
    });
    drawCell(doc, INNER + HALF_W, y, HALF_W2, 15, 'Details of Consignee | Shipped to', {
      fill: HEADER_FILL, bold: true, size: 7.5, align: 'left', pad: 5,
    });
    y += 15;

    const partyH = 88;
    drawPartyBlock(doc, INNER, y, HALF_W, partyH, viewModel.billedTo);
    drawPartyBlock(doc, INNER + HALF_W, y, HALF_W2, partyH, viewModel.shippedTo);
    y += partyH;

    y = viewModel.isInterState
      ? renderInterTable(doc, y, viewModel)
      : renderIntraTable(doc, y, viewModel);

    y = drawTotalsBand(doc, y, viewModel);

    const footerH = 118;
    strokeRect(doc, INNER, y, HALF_W, footerH);
    strokeRect(doc, INNER + HALF_W, y, HALF_W2, footerH);
    drawTextInBox(doc, 'Terms And Conditions', INNER, y + 2, HALF_W, 14, {
      bold: true, size: 8, valign: 'top', pad: 6, align: 'left',
    });
    drawTextInBox(doc, viewModel.termsList.join('\n'), INNER, y + 14, HALF_W, footerH - 16, {
      size: 7.5, lineGap: 0, pad: 6, align: 'left', valign: 'top',
    });
    drawSignatureBlock(doc, y, footerH, viewModel);

    const contentBottom = y + footerH;
    strokeRect(doc, OUTER, PAGE_MARGIN, INNER_W, contentBottom - PAGE_MARGIN);

    drawTextInBox(doc, viewModel.bottomBanner, OUTER, contentBottom + 4, INNER_W, 12, {
      align: 'center', italic: true, size: 9, valign: 'center',
    });

    doc.end();
  });
}

module.exports = { renderInvoicePdf };
