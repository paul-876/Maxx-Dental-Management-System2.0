const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { User, Dentist } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { normalizePhone } = require('../utils/phone');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(7),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  role: z.enum(Object.values(ROLES)),
  professionalInfo: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(), // used when role === DENTIST
});

const updateUserSchema = createUserSchema.partial().omit({ password: true });

// List all users (optionally filter by role/status)
router.get('/', async (req, res) => {
  const { role, status } = req.query;
  const where = {};
  if (role) where.role = role;
  if (status) where.status = status;
  const users = await User.findAll({
    where,
    attributes: { exclude: ['password'] },
    include: [{ model: Dentist, as: 'dentistProfile' }],
    order: [['createdAt', 'DESC']],
  });
  res.json(users);
});

router.get('/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ['password'] },
    include: [{ model: Dentist, as: 'dentistProfile' }],
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

router.post('/', async (req, res) => {
  const data = createUserSchema.parse(req.body);
  const phone = normalizePhone(data.phone);
  const hashed = await bcrypt.hash(data.password, 10);

  const user = await User.create({
    name: data.name,
    email: data.email || null,
    phone,
    password: hashed,
    role: data.role,
    professionalInfo: data.professionalInfo || null,
  });

  let dentistProfile = null;
  if (data.role === ROLES.DENTIST) {
    dentistProfile = await Dentist.create({
      userId: user.id,
      specialization: data.specialization || null,
    });
  }

  await recordAudit({
    userId: req.user.id,
    action: 'USER_CREATED',
    recordType: 'User',
    recordId: user.id,
    details: { role: user.role, createdBy: req.user.id },
  });

  const { password, ...safeUser } = user.toJSON();
  res.status(201).json({ ...safeUser, dentistProfile });
});

router.put('/:id', async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const data = updateUserSchema.parse(req.body);
  if (data.phone) data.phone = normalizePhone(data.phone);

  await user.update({
    name: data.name ?? user.name,
    email: data.email !== undefined ? data.email : user.email,
    phone: data.phone ?? user.phone,
    role: data.role ?? user.role,
    professionalInfo: data.professionalInfo !== undefined ? data.professionalInfo : user.professionalInfo,
  });

  if (user.role === ROLES.DENTIST && data.specialization !== undefined) {
    const [dentist] = await Dentist.findOrCreate({ where: { userId: user.id } });
    dentist.specialization = data.specialization;
    await dentist.save();
  }

  await recordAudit({
    userId: req.user.id,
    action: 'USER_UPDATED',
    recordType: 'User',
    recordId: user.id,
  });

  const { password, ...safeUser } = user.toJSON();
  res.json(safeUser);
});

router.patch('/:id/status', async (req, res) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
  const { status } = schema.parse(req.body);

  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.status = status;
  await user.save();

  if (user.role === ROLES.DENTIST) {
    const dentist = await Dentist.findOne({ where: { userId: user.id } });
    if (dentist) {
      dentist.status = status;
      await dentist.save();
    }
  }

  await recordAudit({
    userId: req.user.id,
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    recordType: 'User',
    recordId: user.id,
  });

  res.json({ id: user.id, status: user.status });
});

router.patch('/:id/password', async (req, res) => {
  const schema = z.object({ password: z.string().min(6) });
  const { password } = schema.parse(req.body);

  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  await recordAudit({
    userId: req.user.id,
    action: 'USER_PASSWORD_RESET',
    recordType: 'User',
    recordId: user.id,
  });

  res.json({ message: 'Password updated.' });
});

module.exports = router;
