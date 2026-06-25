const orgService = require('./service');
const { writeAuditLog } = require('../../middleware/auditLog');

async function get(req, res, next) {
  try {
    const lite = req.query.lite === 'true';
    const settings = await orgService.getOrgSettings({ includeAssets: !lite });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

async function media(req, res, next) {
  try {
    const assets = await orgService.getOrgSettingsAssets();
    res.json({ assets });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const settings = await orgService.updateOrgSettings(req.body);
    await writeAuditLog(req.user.id, 'update', 'org_settings', settings.id, req.body);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

async function branding(req, res, next) {
  try {
    const branding = await orgService.getPublicBranding();
    res.json({ branding });
  } catch (err) {
    next(err);
  }
}

module.exports = { get, update, branding, media };
