const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign,
} = require('docx');
const { parseDataUrl } = require('../../utils/imageData');
const { HEADER_FILL } = require('./invoiceViewModel');

const border = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };

function shadeCell(children, opts = {}) {
  return new TableCell({
    borders,
    shading: opts.shade ? { fill: HEADER_FILL.replace('#', '') } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}

function textPara(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text: String(text || ''), bold: !!opts.bold, size: opts.size || 18, italics: !!opts.italic })],
  });
}

function cell(text, opts = {}) {
  return shadeCell([textPara(text, opts)], opts);
}

function imagePara(dataUrl, width, height) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return textPara('');
  try {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: parsed.buffer,
          transformation: { width, height },
          type: parsed.format === 'png' ? 'png' : 'jpg',
        }),
      ],
    });
  } catch {
    return textPara('');
  }
}

function buildInvoiceDocx(viewModel) {
  const headerChildren = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: viewModel.topBanner, italics: true, size: 18 })] }),
  ];

  if (viewModel.logoUrl) {
    headerChildren.push(imagePara(viewModel.logoUrl, 80, 80));
  }

  headerChildren.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: viewModel.companyName, bold: true, size: 32 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: viewModel.companyAddress, size: 18 })] }),
    new Paragraph({
      children: [
        new TextRun({ text: `GSTIN : ${viewModel.companyGstin}    `, size: 18 }),
        new TextRun({ text: `State Code : ${viewModel.companyStateCode}`, size: 18 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: viewModel.title, bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: viewModel.originalForRecipient, size: 18 })],
    })
  );

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('Invoice Number', { bold: true }), cell(viewModel.invoiceNumber)] }),
      new TableRow({ children: [cell('Invoice Date', { bold: true }), cell(viewModel.invoiceDate)] }),
      new TableRow({ children: [cell('State', { bold: true }), cell(viewModel.stateLabel)] }),
      new TableRow({ children: [cell('Reverse Charge', { bold: true }), cell(viewModel.reverseCharge)] }),
    ],
  });

  const partyHeader = new TableRow({
    children: [
      shadeCell([textPara('Details of Receiver | Billed to', { bold: true })], { width: 50, shade: true }),
      shadeCell([textPara('Details of Consignee | Shipped to', { bold: true })], { width: 50, shade: true }),
    ],
  });

  const partyBody = new TableRow({
    children: [
      cell(viewModel.billedToLines.join('\n'), { width: 50 }),
      cell(viewModel.shippedToLines.join('\n'), { width: 50 }),
    ],
  });

  const lineHeader = viewModel.isInterState
    ? ['Sr. No.', 'Name of Product', 'HSN/SAC', 'QTY', 'Unit', 'Rate', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total']
    : ['Sr. No.', 'Name of Product', 'HSN/SAC', 'QTY', 'Unit', 'Rate', 'Taxable Value', 'SGST Rate', 'SGST Amt', 'CGST Rate', 'CGST Amt', 'Total'];

  const lineRows = viewModel.tableLines.map((line) => {
    const cells = viewModel.isInterState
      ? [line.srNo, line.productName, line.hsnSac, line.qty, line.unit, line.rate, line.taxableValue, line.igstRate, line.igstAmount, line.total]
      : [line.srNo, line.productName, line.hsnSac, line.qty, line.unit, line.rate, line.taxableValue, line.sgstRate, line.sgstAmount, line.cgstRate, line.cgstAmount, line.total];
    return new TableRow({ children: cells.map((c) => cell(c)) });
  });

  const totalRowCells = viewModel.isInterState
    ? ['Total', '', '', '', '', '', viewModel.tableTotals.taxableValue, '', viewModel.tableTotals.igstAmount, viewModel.tableTotals.total]
    : ['Total', '', '', '', '', '', viewModel.tableTotals.taxableValue, '', viewModel.tableTotals.sgstAmount, '', viewModel.tableTotals.cgstAmount, viewModel.tableTotals.total];

  const itemsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: lineHeader.map((h) => cell(h, { bold: true, shade: true })) }),
      ...lineRows,
      new TableRow({ children: totalRowCells.map((c, i) => cell(c, { bold: i === 0 || i === totalRowCells.length - 1, shade: i === 0 })) }),
    ],
  });

  const summaryRows = viewModel.isInterState
    ? [
      { label: 'Total Amount Before Tax', value: viewModel.totals.subtotal, shade: true },
      { label: `Add : IGST ${viewModel.totals.igstRate}%`, value: viewModel.totals.igstAmount, shade: false },
      { label: 'Total Tax Amount', value: viewModel.totals.totalTax, shade: true },
      { label: 'Final Invoice Amount', value: viewModel.totals.finalAmount, shade: true, bold: true },
    ]
    : [
      { label: 'Total Amount Before Tax', value: viewModel.totals.subtotal, shade: true },
      { label: `Add : CGST ${viewModel.totals.cgstRate}%`, value: viewModel.totals.cgstAmount, shade: false },
      { label: `SGST ${viewModel.totals.sgstRate}%`, value: viewModel.totals.sgstAmount, shade: false },
      { label: 'Total Tax Amount', value: viewModel.totals.totalTax, shade: true },
      { label: 'Final Invoice Amount', value: viewModel.totals.finalAmount, shade: true, bold: true },
    ];

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: summaryRows.map((row) => new TableRow({
      children: [
        shadeCell([textPara(row.label, { bold: !!row.bold })], { shade: row.shade }),
        shadeCell([textPara(row.value, { align: AlignmentType.RIGHT, bold: !!row.bold })], { shade: row.shade }),
      ],
    })),
  });

  const signatureChildren = [
    textPara(viewModel.signatureBlock.certification, { align: AlignmentType.CENTER }),
    textPara(''),
    textPara(viewModel.signatureBlock.forCompany, { align: AlignmentType.RIGHT, bold: true }),
    textPara(''),
    ...(viewModel.signatureUrl ? [imagePara(viewModel.signatureUrl, 120, 70)] : [textPara('')]),
    textPara(''),
    textPara(viewModel.signatureBlock.signatory, { align: AlignmentType.RIGHT }),
  ];

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          shadeCell([
            textPara('Total Invoice Amount in words', { bold: true }),
            textPara(viewModel.amountInWords, { bold: true }),
          ], { width: 55 }),
          new TableCell({
            borders,
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [summaryTable],
          }),
        ],
      }),
      new TableRow({
        children: [
          shadeCell([
            textPara('Terms And Conditions', { bold: true }),
            ...viewModel.termsList.map((t) => textPara(t)),
          ], { width: 55 }),
          shadeCell(signatureChildren, { width: 45 }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      children: [
        ...headerChildren,
        metaTable,
        new Paragraph({ text: '' }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [partyHeader, partyBody] }),
        new Paragraph({ text: '' }),
        itemsTable,
        new Paragraph({ text: '' }),
        footerTable,
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: viewModel.bottomBanner, italics: true, size: 18 })] }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildInvoiceDocx };
