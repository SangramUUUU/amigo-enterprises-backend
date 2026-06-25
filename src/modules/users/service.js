const pool = require('../../db/pool');
const bcrypt = require('bcryptjs');

const USER_FIELDS = 'id, name, email, role, is_active, created_at, updated_at';

async function listUsers(requesterRole) {
  if (requesterRole === 'super_admin') {
    const { rows } = await pool.query(
      `SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`
    );
    return rows;
  }
  if (requesterRole === 'admin') {
    const { rows } = await pool.query(
      `SELECT ${USER_FIELDS} FROM users WHERE role = 'employee' ORDER BY created_at DESC`
    );
    return rows;
  }
  return [];
}

async function createUser(data, requesterRole) {
  const role = data.role || 'employee';
  if (requesterRole === 'admin' && role !== 'employee') {
    const err = new Error('Admins can only create employees');
    err.status = 403;
    throw err;
  }
  if (requesterRole === 'employee') {
    const err = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_FIELDS}`,
    [data.name, data.email.toLowerCase().trim(), passwordHash, role]
  );
  return rows[0];
}

async function updateUser(id, data, requesterRole, requesterId) {
  const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const user = existing[0];

  if (requesterRole === 'admin') {
    if (user.role !== 'employee') {
      const err = new Error('Admins can only manage employees');
      err.status = 403;
      throw err;
    }
    if (data.role && data.role !== 'employee') {
      const err = new Error('Admins cannot change role to admin');
      err.status = 403;
      throw err;
    }
  }

  if (data.role && data.role !== user.role && requesterRole !== 'super_admin') {
    const err = new Error('Only super admin can change roles');
    err.status = 403;
    throw err;
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${idx++}`);
    values.push(data.email.toLowerCase().trim());
  }
  if (data.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(data.role);
  }
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 12);
    fields.push(`password_hash = $${idx++}`);
    values.push(hash);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(data.is_active);
  }

  if (fields.length === 0) return user;

  fields.push('updated_at = NOW()');
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${USER_FIELDS}`,
    values
  );
  return rows[0];
}

async function deactivateUser(id, requesterRole) {
  const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (existing.length === 0) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const user = existing[0];

  if (requesterRole === 'admin' && user.role !== 'employee') {
    const err = new Error('Admins can only deactivate employees');
    err.status = 403;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING ${USER_FIELDS}`,
    [id]
  );
  return rows[0];
}

module.exports = { listUsers, createUser, updateUser, deactivateUser };
