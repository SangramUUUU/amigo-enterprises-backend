const customerService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');

async function list(req, res, next) {
  try {
    const customers = await customerService.listCustomers({
      q: req.query.q,
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const customer = await customerService.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Customer not found' });
    }
    res.json({ customer });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.name) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Name is required' });
    }
    const customer = await customerService.createCustomer(req.body);
    await writeAuditLog(req.user.id, 'create', 'customer', customer.id, { name: customer.name });
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const customer = await customerService.updateCustomer(req.params.id, req.body);
    await writeAuditLog(req.user.id, 'update', 'customer', customer.id, req.body);
    res.json({ customer });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const customer = await customerService.softDeleteCustomer(req.params.id);
    await writeAuditLog(req.user.id, 'deactivate', 'customer', customer.id, {});
    res.json({ customer });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
