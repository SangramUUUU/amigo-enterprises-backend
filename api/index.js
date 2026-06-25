let appHandler = null;

function sendHealth(res) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
}

function isHealthRequest(req) {
  const path = (req.url || '').split('?')[0];
  return path === '/api/health' || path === '/health' || path.endsWith('/api/health');
}

module.exports = async (req, res) => {
  if (isHealthRequest(req)) {
    sendHealth(res);
    return;
  }

  if (!appHandler) {
    const serverless = require('serverless-http');
    const app = require('../src/app');
    appHandler = serverless(app, { binary: true });
  }

  return appHandler(req, res);
};
