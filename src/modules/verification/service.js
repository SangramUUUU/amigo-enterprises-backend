const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../../db/pool');
const { sendEmail } = require('../../utils/email');
const { buildOtpEmailHtml, buildOtpEmailText } = require('../../utils/otpEmailTemplate');
const orgService = require('../orgSettings/service');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const DAILY_OTP_LIMITS = {
  create_user: 100,
  finalize_invoice: 100,
};

const ACTION_LABELS = {
  create_user: 'Add new employee',
  finalize_invoice: 'Finalize invoice',
};

function isOtpEnabled(settings) {
  return Boolean(
    settings?.smtp_enabled
    && settings.smtp_email
    && settings.smtp_app_password
  );
}

async function getOtpConfig() {
  const smtp = await orgService.getOrgSmtpCredentials();
  const enabled = isOtpEnabled(smtp);
  return {
    enabled,
    maskedEmail: smtp?.smtp_email
      ? smtp.smtp_email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
      : null,
    settings: smtp,
  };
}

function stablePayloadHash(payload) {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

function payloadsMatch(actionType, stored, incoming) {
  if (actionType === 'create_user') {
    return stored.name === incoming.name
      && stored.email === incoming.email
      && stored.password === incoming.password
      && (stored.role || 'employee') === (incoming.role || 'employee');
  }
  if (actionType === 'finalize_invoice') {
    return String(stored.invoiceId) === String(incoming.invoiceId);
  }
  return stablePayloadHash(stored) === stablePayloadHash(incoming);
}

async function countDailyRequests(userId, actionType) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM otp_verifications
     WHERE user_id = $1
       AND action_type = $2
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId, actionType]
  );
  return rows[0].count;
}

async function getOtpEmailContext(actionType, payload) {
  if (actionType === 'create_user') {
    return {
      detailLabel: 'Employee Email',
      detailValue: payload.email || '—',
    };
  }

  if (actionType === 'finalize_invoice' && payload.invoiceId) {
    const { rows } = await pool.query(
      `SELECT i.invoice_number, c.name AS customer_name
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.id = $1`,
      [payload.invoiceId]
    );
    if (rows.length > 0) {
      const inv = rows[0];
      const label = inv.customer_name
        ? `${inv.invoice_number} · ${inv.customer_name}`
        : inv.invoice_number;
      return { detailLabel: 'Invoice', detailValue: label };
    }
    return { detailLabel: 'Invoice', detailValue: payload.invoiceId };
  }

  return { detailLabel: '', detailValue: '' };
}

async function requestOtp(userId, actionType, payload) {
  const { enabled, settings, maskedEmail } = await getOtpConfig();
  if (!enabled) {
    return { otpRequired: false };
  }

  if (!ACTION_LABELS[actionType]) {
    const err = new Error('Invalid verification action');
    err.status = 400;
    throw err;
  }

  const dailyLimit = DAILY_OTP_LIMITS[actionType] ?? 100;
  const recent = await countDailyRequests(userId, actionType);
  if (recent >= dailyLimit) {
    const err = new Error(
      `Daily OTP limit reached (${dailyLimit} per day for ${ACTION_LABELS[actionType]}). Try again tomorrow.`
    );
    err.status = 429;
    throw err;
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const { rows } = await pool.query(
    `INSERT INTO otp_verifications (user_id, action_type, payload, otp_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, expires_at`,
    [userId, actionType, JSON.stringify(payload), otpHash, expiresAt]
  );

  const actionLabel = ACTION_LABELS[actionType];
  const { detailLabel, detailValue } = await getOtpEmailContext(actionType, payload);
  const orgProfile = await orgService.getOrgSettings({ includeAssets: false });
  const companyName = orgProfile?.company_name?.trim() || 'Amigo Enterprises';
  const expiresMinutes = OTP_TTL_MS / 60000;

  const emailParams = {
    companyName,
    actionLabel,
    detailLabel,
    detailValue,
    otp,
    expiresMinutes,
  };

  await sendEmail({
    to: settings.smtp_email,
    subject: `${companyName} — Verification code for ${actionLabel}`,
    text: buildOtpEmailText(emailParams),
    html: buildOtpEmailHtml(emailParams),
    orgSmtp: settings,
  });

  return {
    otpRequired: true,
    verificationId: rows[0].id,
    expiresAt: rows[0].expires_at,
    maskedEmail,
  };
}

async function verifyOtp(userId, verificationId, code) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE id = $1 AND user_id = $2`,
    [verificationId, userId]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid verification request');
    err.status = 400;
    throw err;
  }

  const challenge = rows[0];

  if (challenge.consumed_at) {
    const err = new Error('This verification code was already used');
    err.status = 400;
    throw err;
  }

  if (challenge.verified_at) {
    return { verified: true, verificationId: challenge.id };
  }

  if (new Date(challenge.expires_at) < new Date()) {
    const err = new Error('Verification code has expired');
    err.status = 400;
    throw err;
  }

  if (challenge.attempts >= MAX_ATTEMPTS) {
    const err = new Error('Too many failed attempts. Request a new code.');
    err.status = 400;
    throw err;
  }

  const valid = await bcrypt.compare(String(code), challenge.otp_hash);
  if (!valid) {
    await pool.query(
      'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1',
      [verificationId]
    );
    const err = new Error('Invalid verification code');
    err.status = 400;
    throw err;
  }

  await pool.query(
    'UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1',
    [verificationId]
  );

  return { verified: true, verificationId: challenge.id };
}

async function consumeVerification(userId, verificationId, actionType, payload) {
  const { enabled } = await getOtpConfig();
  if (!enabled) {
    return { consumed: false };
  }

  if (!verificationId) {
    const err = new Error('Email verification is required');
    err.status = 403;
    err.code = 'OTP_REQUIRED';
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE id = $1 AND user_id = $2 AND action_type = $3`,
    [verificationId, userId, actionType]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid or expired verification');
    err.status = 403;
    throw err;
  }

  const challenge = rows[0];

  if (!challenge.verified_at) {
    const err = new Error('Please verify the OTP before proceeding');
    err.status = 403;
    err.code = 'OTP_NOT_VERIFIED';
    throw err;
  }

  if (challenge.consumed_at) {
    const err = new Error('This verification was already used');
    err.status = 403;
    throw err;
  }

  if (new Date(challenge.expires_at) < new Date()) {
    const err = new Error('Verification has expired. Request a new code.');
    err.status = 403;
    throw err;
  }

  const storedPayload = typeof challenge.payload === 'string'
    ? JSON.parse(challenge.payload)
    : challenge.payload;

  if (!payloadsMatch(actionType, storedPayload, payload)) {
    const err = new Error('Request data does not match verified action');
    err.status = 403;
    throw err;
  }

  await pool.query(
    'UPDATE otp_verifications SET consumed_at = NOW() WHERE id = $1',
    [verificationId]
  );

  return { consumed: true };
}

module.exports = {
  getOtpConfig,
  isOtpEnabled,
  requestOtp,
  verifyOtp,
  consumeVerification,
};
