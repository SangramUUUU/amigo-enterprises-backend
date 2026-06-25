const pool = require('../../db/pool');
const bcrypt = require('bcryptjs');

async function findUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND is_active = true',
    [email.toLowerCase().trim()]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, is_active FROM users WHERE id = $1 AND is_active = true',
    [id]
  );
  return rows[0] || null;
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

module.exports = {
  findUserByEmail,
  findUserById,
  verifyPassword,
  sanitizeUser,
};
