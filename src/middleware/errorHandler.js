const { ZodError } = require('zod');
const { ValidationError, UniqueConstraintError } = require('sequelize');

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof UniqueConstraintError) {
    return res.status(409).json({
      error: 'A record with this value already exists.',
      details: err.errors?.map((e) => ({ path: e.path, message: e.message })),
    });
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: err.errors?.map((e) => ({ path: e.path, message: e.message })),
    });
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
}

module.exports = { notFoundHandler, errorHandler };
