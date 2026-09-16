const jwt = require('jsonwebtoken');
const { User } = require('../models');

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/** Restrict a route to one or more roles. Usage: authorize('SUPER_ADMIN', 'DENTIST') */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
