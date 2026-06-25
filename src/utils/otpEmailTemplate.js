function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOtpEmailHtml({
  companyName = 'Amigo Enterprises',
  actionLabel,
  detailLabel,
  detailValue,
  otp,
  expiresMinutes = 10,
}) {
  const safeCompany = escapeHtml(companyName);
  const safeAction = escapeHtml(actionLabel);
  const safeDetailLabel = escapeHtml(detailLabel);
  const safeDetailValue = escapeHtml(detailValue);
  const safeOtp = escapeHtml(otp);
  const otpDigits = safeOtp.split('').map((digit) => (
    `<td style="width:44px;height:52px;text-align:center;vertical-align:middle;
      font-size:28px;font-weight:700;color:#1565c0;letter-spacing:0;
      background:#ffffff;border:2px solid #1565c0;border-radius:8px;
      font-family:'Segoe UI',Roboto,Arial,sans-serif;">${digit}</td>`
  )).join('<td style="width:8px;"></td>');

  const detailBlock = detailLabel && detailValue
    ? `<tr>
        <td style="padding:0 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
            style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 18px;">
                <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#64748b;
                  text-transform:uppercase;letter-spacing:0.06em;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
                  ${safeDetailLabel}
                </p>
                <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;
                  font-family:'Segoe UI',Roboto,Arial,sans-serif;">${safeDetailValue}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
          style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;
          box-shadow:0 8px 24px rgba(21,101,192,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg,#1565c0 0%,#0d47a1 100%);padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);
                letter-spacing:0.08em;text-transform:uppercase;">${safeCompany}</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
                Verification Required
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;text-align:center;">
              <p style="margin:0 0 6px;font-size:14px;color:#64748b;">Action</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${safeAction}</p>
            </td>
          </tr>
          ${detailBlock}
          <tr>
            <td style="padding:24px 32px 8px;text-align:center;">
              <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.5;">
                Use this one-time code to confirm the action in your ERP dashboard:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>${otpDigits}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px;text-align:center;">
              <p style="margin:0;display:inline-block;padding:8px 14px;background:#fff8e1;
                border:1px solid #ffe082;border-radius:999px;font-size:13px;color:#f57f17;font-weight:600;">
                Expires in ${expiresMinutes} minutes
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#f1f5f9;border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px;font-size:13px;color:#64748b;line-height:1.5;">
                    If you did not request this code, you can safely ignore this email.
                    Do not share this OTP with anyone.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Sent securely by ${safeCompany} ERP
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOtpEmailText({ actionLabel, detailLabel, detailValue, otp, expiresMinutes = 10 }) {
  return [
    `Verification code for: ${actionLabel}`,
    detailLabel && detailValue ? `${detailLabel}: ${detailValue}` : '',
    '',
    `Your OTP is: ${otp}`,
    '',
    `This code expires in ${expiresMinutes} minutes.`,
    'If you did not request this, ignore this email.',
  ].filter(Boolean).join('\n');
}

module.exports = { buildOtpEmailHtml, buildOtpEmailText };
