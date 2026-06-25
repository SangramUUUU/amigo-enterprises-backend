let appHandler = null;
let startupError = null;

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function sendHealth(res) {
  sendJson(res, 200, {
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

function requestPath(req) {
  return (req.url || '').split('?')[0];
}

function isHealthRequest(req) {
  const path = requestPath(req);
  return path === '/api/health' || path === '/health' || path.endsWith('/api/health');
}

function getAppHandler() {
  if (startupError) throw startupError;
  if (appHandler) return appHandler;

  if (!process.env.DATABASE_URL) {
    startupError = new Error('DATABASE_URL is not configured on Vercel');
    throw startupError;
  }
  if (!process.env.SESSION_SECRET) {
    startupError = new Error('SESSION_SECRET is not configured on Vercel');
    throw startupError;
  }

  const serverless = require('serverless-http');
  const app = require('../src/app');
  appHandler = serverless(app, { binary: true });
  return appHandler;
}

module.exports = async (req, res) => {
  if (isHealthRequest(req)) {
    sendHealth(res);
    return;
  }

  try {
    const handler = getAppHandler();
    return handler(req, res);
  } catch (err) {
    sendJson(res, 500, {
      error: 'STARTUP_ERROR',
      message: err.message,
      hint: 'Set DATABASE_URL and SESSION_SECRET in Vercel → Project → Settings → Environment Variables, then redeploy.',
    });
  }
};
