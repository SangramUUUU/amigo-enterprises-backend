const dashboardService = require('./service');

async function stats(req, res, next) {
  try {
    const stats = await dashboardService.getStats();
    res.json({ stats });
  } catch (err) {
    next(err);
  }
}

module.exports = { stats };
