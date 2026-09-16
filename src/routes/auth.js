const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { User, Dentist } = require('../models');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { normalizePhone } = require('../utils/phone');

const router = express.Router();

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone is required.'), // email or phone
  password: z.string().min(1, 'Password is required.'),
});

router.post('/login', async (req, res) => {
  const { identifier, password } = loginSchema.parse(req.body);

  const normalizedPhone = normalizePhone(identifier);
  const { Op } = require('sequelize');
  const user = await User.findOne({
    where: {
      [Op.or]: [{ email: identifier }, { phone: identifier }, { phone: normalizedPhone }],
    },
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account has been deactivated. Contact the Super Admin.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  });

  let dentistProfile = null;
  if (user.role === 'DENTIST') {
    dentistProfile = await Dentist.findOne({ where: { userId: user.id } });
  }

  await recordAudit({ userId: user.id, action: 'LOGIN', recordType: 'User', recordId: user.id });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      dentistId: dentistProfile ? dentistProfile.id : null,
    },
  });
});

router.get('/me', authenticate, async (req, res) => {
  const user = req.user;
  let dentistProfile = null;
  if (user.role === 'DENTIST') {
    dentistProfile = await Dentist.findOne({ where: { userId: user.id } });
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    dentistId: dentistProfile ? dentistProfile.id : null,
  });
});

module.exports = router;
