const jobService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');

async function list(req, res, next) {
  try {
    const jobs = await jobService.listJobs({
      status: req.query.status,
      customerId: req.query.customer_id,
      assignedTo: req.query.assigned_to,
      q: req.query.q,
    });
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const job = await jobService.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found' });
    }
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.customer_id) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'customer_id is required' });
    }
    const job = await jobService.createJob(req.body, req.user.id);
    await writeAuditLog(req.user.id, 'create', 'service_job', job.id, {});
    res.status(201).json({ job });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const job = await jobService.updateJob(req.params.id, req.body);
    await writeAuditLog(req.user.id, 'update', 'service_job', job.id, req.body);
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const job = await jobService.completeJob(req.params.id, req.body.completed_date);
    await writeAuditLog(req.user.id, 'complete', 'service_job', job.id, {});
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function generateInvoice(req, res, next) {
  try {
    const job = await jobService.generateInvoiceFromJob(req.params.id, req.user.id);
    await writeAuditLog(req.user.id, 'generate_invoice', 'service_job', job.id, {
      invoice_id: job.generated_invoice_id,
    });
    res.json({ job });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, complete, generateInvoice };
