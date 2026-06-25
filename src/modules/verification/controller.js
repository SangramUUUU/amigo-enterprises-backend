const verificationService = require('./service');

async function status(req, res, next) {
  try {
    const config = await verificationService.getOtpConfig();
    res.json({
      otpRequired: config.enabled,
      maskedEmail: config.maskedEmail,
    });
  } catch (err) {
    next(err);
  }
}

async function request(req, res, next) {
  try {
    const { action, payload } = req.body;
    if (!action || !payload) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Action and payload are required',
      });
    }

    const result = await verificationService.requestOtp(req.user.id, action, payload);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function verify(req, res, next) {
  try {
    const { verificationId, code } = req.body;
    if (!verificationId || !code) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Verification ID and code are required',
      });
    }

    const result = await verificationService.verifyOtp(req.user.id, verificationId, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { status, request, verify };
