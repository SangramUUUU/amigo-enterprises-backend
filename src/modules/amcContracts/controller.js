const amcService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');

async function list(req, res, next) {
  try {
    const contracts = await amcService.listContracts({
      q: req.query.q,
      customerId: req.query.customer_id,
      includeInactive: req.query.includeInactive === 'true',
    });
    res.json({ contracts });
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const contract = await amcService.getContract(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Contract not found' });
    }
    res.json({ contract });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    if (!req.body.customer_id || !req.body.start_date || !req.body.end_date) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'customer_id, start_date, and end_date are required',
      });
    }
    if (!req.body.contract_number) {
      req.body.contract_number = await amcService.generateContractNumber();
    }
    const contract = await amcService.createContract(req.body);
    await writeAuditLog(req.user.id, 'create', 'amc_contract', contract.id, {});
    res.status(201).json({ contract });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const contract = await amcService.updateContract(req.params.id, req.body);
    await writeAuditLog(req.user.id, 'update', 'amc_contract', contract.id, req.body);
    res.json({ contract });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const contract = await amcService.softDeleteContract(req.params.id);
    await writeAuditLog(req.user.id, 'deactivate', 'amc_contract', contract.id, {});
    res.json({ contract });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, get, create, update, remove };
