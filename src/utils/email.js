const nodemailer = require('nodemailer');

let envTransporter = null;

function getEnvTransporter() {
  if (envTransporter) return envTransporter;
  if (!process.env.SMTP_HOST) return null;
  envTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return envTransporter;
}

function createOrgTransporter(orgSmtp) {
  if (!orgSmtp?.smtp_email || !orgSmtp?.smtp_app_password) return null;
  return nodemailer.createTransport({
    host: orgSmtp.smtp_host || 'smtp.gmail.com',
    port: Number(orgSmtp.smtp_port || 587),
    secure: false,
    auth: {
      user: orgSmtp.smtp_email,
      pass: orgSmtp.smtp_app_password,
    },
  });
}

async function sendEmail({ to, subject, text, html, orgSmtp }) {
  const transport = orgSmtp ? createOrgTransporter(orgSmtp) : getEnvTransporter();
  const from = orgSmtp?.smtp_email || process.env.SMTP_FROM || 'noreply@amigo-enterprises.local';

  if (!transport) {
    console.log(`[email noop] To: ${to} | ${subject} | ${text || '(html)'}`);
    return;
  }

  await transport.sendMail({ from, to, subject, text, html });
}

module.exports = { sendEmail, createOrgTransporter };
