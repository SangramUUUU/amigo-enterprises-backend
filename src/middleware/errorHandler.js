function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  const dbCodes = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', '57P01', '53300']);
  const isDbError = dbCodes.has(err.code) || /connect|timeout|database|ECONNRESET/i.test(message);

  res.status(isDbError ? 503 : status).json({
    error: err.code || (isDbError ? 'DATABASE_ERROR' : 'INTERNAL_ERROR'),
    message: isDbError
      ? 'Database connection failed. Check DATABASE_URL on Vercel (Supabase pooler URL, password URL-encoded).'
      : message,
  });
}

module.exports = errorHandler;
