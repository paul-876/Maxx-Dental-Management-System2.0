const express = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const { Message, User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// Every account (Front Desk, Dentist, Super Admin) posts to this shared
// group thread by default — the clinic-wide chat area.
const CLINIC_GROUP = 'CLINIC';

const sendSchema = z.object({
  receiverId: z.string().uuid().optional().nullable(),
  groupName: z.string().optional().nullable(),
  message: z.string().min(1),
});

const userAttrs = ['id', 'name', 'role', 'status'];
const withParticipants = [
  { model: User, as: 'sender', attributes: userAttrs },
  { model: User, as: 'receiver', attributes: userAttrs },
];

// Everyone you can start a direct conversation with.
router.get('/contacts', async (req, res) => {
  const users = await User.findAll({
    where: { id: { [Op.ne]: req.user.id } },
    attributes: userAttrs,
    order: [['name', 'ASC']],
  });
  res.json(users);
});

// Super Admin oversight: every message across every conversation and the
// clinic group, regardless of who sent/received it. Lets the Super Admin
// review the full chat history for the whole system, not just their own.
router.get('/all', authorize(ROLES.SUPER_ADMIN), async (req, res) => {
  const messages = await Message.findAll({
    include: withParticipants,
    order: [['createdAt', 'DESC']],
    limit: 1000,
  });
  res.json(messages);
});

// List conversation with a specific user, or a group/department thread
// (defaults to the clinic-wide group when neither is given).
router.get('/', async (req, res) => {
  const { withUser, group } = req.query;
  const where = {};

  if (withUser) {
    where[Op.or] = [
      { senderId: req.user.id, receiverId: withUser },
      { senderId: withUser, receiverId: req.user.id },
    ];
  } else if (group) {
    where.groupName = group;
  } else {
    where.groupName = CLINIC_GROUP;
  }

  const messages = await Message.findAll({
    where,
    include: withParticipants,
    order: [['createdAt', 'ASC']],
    limit: 200,
  });
  res.json(messages);
});

router.post('/', async (req, res) => {
  const data = sendSchema.parse(req.body);
  if (!data.receiverId && !data.groupName) {
    return res.status(400).json({ error: 'Either receiverId or groupName is required.' });
  }

  const message = await Message.create({
    senderId: req.user.id,
    receiverId: data.receiverId || null,
    groupName: data.groupName || null,
    message: data.message,
  });

  const full = await Message.findByPk(message.id, { include: withParticipants });
  res.status(201).json(full);
});

router.patch('/:id/read', async (req, res) => {
  const message = await Message.findByPk(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  message.readStatus = true;
  await message.save();
  res.json(message);
});

module.exports = router;
