const invoiceService = require('./service');
const { getOrgSettings } = require('../orgSettings/service');
const { buildInvoiceViewModel } = require('./invoiceViewModel');
const { renderInvoicePdf } = require('./pdfRenderer');
const { buildInvoiceDocx } = require('./docRenderer');
const { writeAuditLog } = require('../../middleware/auditLog');
const verificationService = require('../verification/service');
const {
  buildInvoiceExportFilename,
  contentDispositionAttachment,
} = require('../../utils/invoiceExport');

async function list(req, res, next) {
  try {
    const invoices = await invoiceService.listInvoices({
      status: req.query.status,
      customerId: req.query.customer_id,
      q: req.query.q,
    });
    res.json({ invoices });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found' });
    }
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

async function formData(req, res, next) {
  try {
    const data = await invoiceService.getInvoiceFormData(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found' });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function formOptions(req, res, next) {
  try {
    const data = await invoiceService.getNewInvoiceFormOptions();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.customer_id || !req.body.line_items?.length) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'customer_id and line_items are required',
      });
    }
    const invoice = await invoiceService.createInvoice(req.body, req.user.id);
    await writeAuditLog(req.user.id, 'create', 'invoice', invoice.id, {
      invoice_number: invoice.invoice_number,
    });
    res.status(201).json({ invoice });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const invoice = await invoiceService.updateInvoice(req.params.id, req.body, req.user.role);
    res.json({ invoice });
    writeAuditLog(req.user.id, 'update', 'invoice', invoice.id, req.body).catch(() => {});
  } catch (err) {
    next(err);
  }
}

async function finalize(req, res, next) {
  try {
    await verificationService.consumeVerification(
      req.user.id,
      req.body?.verificationId,
      'finalize_invoice',
      { invoiceId: req.params.id }
    );

    const invoice = await invoiceService.finalizeInvoice(req.params.id, req.user.role);
    await writeAuditLog(req.user.id, 'finalize', 'invoice', invoice.id, {});
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const invoice = await invoiceService.cancelInvoice(req.params.id, req.user.role);
    await writeAuditLog(req.user.id, 'cancel', 'invoice', invoice.id, {});
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await invoiceService.deleteInvoice(req.params.id, req.user.role);
    await writeAuditLog(req.user.id, 'delete', 'invoice', result.id, {
      invoice_number: result.invoice_number,
    });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    next(err);
  }
}

async function addPayment(req, res, next) {
  try {
    if (!req.body.amount) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amount is required' });
    }
    const invoice = await invoiceService.addPayment(req.params.id, req.body, req.user.role);
    await writeAuditLog(req.user.id, 'payment', 'invoice', invoice.id, req.body);
    res.json({ invoice });
  } catch (err) {
    next(err);
  }
}

async function exportPdf(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found' });
    }
    const org = await getOrgSettings();
    const viewModel = buildInvoiceViewModel(invoice, invoice.line_items, org);
    const buffer = await renderInvoicePdf(viewModel);
    const filename = buildInvoiceExportFilename({
      prefix: org.invoice_number_prefix,
      invoiceDate: invoice.invoice_date,
      customerName: invoice.customer_name,
      extension: 'pdf',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

async function exportDoc(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Invoice not found' });
    }
    const org = await getOrgSettings();
    const viewModel = buildInvoiceViewModel(invoice, invoice.line_items, org);
    const buffer = await buildInvoiceDocx(viewModel);
    const filename = buildInvoiceExportFilename({
      prefix: org.invoice_number_prefix,
      invoiceDate: invoice.invoice_date,
      customerName: invoice.customer_name,
      extension: 'docx',
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', contentDispositionAttachment(filename));
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list, get, formData, formOptions, create, update, finalize, cancel, remove, addPayment, exportPdf, exportDoc,
};
