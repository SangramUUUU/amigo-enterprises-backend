const userService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');
const verificationService = require('../verification/service');

async function list(req, res, next) {
  try {
    const users = await userService.listUsers(req.user.role);
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const { name, email, password, role, verificationId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Name, email, and password are required',
      });
    }

    await verificationService.consumeVerification(
      req.user.id,
      verificationId,
      'create_user',
      { name, email, password, role: role || 'employee' }
    );

    const user = await userService.createUser(
      { name, email, password, role: role || 'employee' },
      req.user.role
    );
    await writeAuditLog(req.user.id, 'create', 'user', user.id, { email: user.email, role: user.role });
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      err.status = 409;
      err.message = 'Email already exists';
    }
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user.role, req.user.id);
    await writeAuditLog(req.user.id, 'update', 'user', user.id, req.body);
    res.json({ user });
  } catch (err) {
    if (err.code === '23505') {
      err.status = 409;
      err.message = 'Email already exists';
    }
    next(err);
  }
}

async function deactivate(req, res, next) {
  try {
    const user = await userService.deactivateUser(req.params.id, req.user.role);
    await writeAuditLog(req.user.id, 'deactivate', 'user', user.id, {});
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, deactivate };
