const express = require('express');
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const notifications = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  res.json(notifications);
});

router.patch('/:id/read', async (req, res) => {
  const notification = await Notification.findByPk(req.params.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  notification.status = 'READ';
  await notification.save();
  res.json(notification);
});

module.exports = router;
