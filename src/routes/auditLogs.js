const express = require('express');
const { AuditLog, User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

router.get('/', async (req, res) => {
  const { userId, action, recordType, limit } = req.query;
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (recordType) where.recordType = recordType;

  const logs = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'role'] }],
    order: [['timestamp', 'DESC']],
    limit: limit ? parseInt(limit, 10) : 200,
  });
  res.json(logs);
});

module.exports = router;
