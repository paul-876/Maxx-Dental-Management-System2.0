const express = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const { Medicine } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

const medicineSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(0).optional(),
  price: z.number().min(0).optional(),
  expiryDate: z.string().optional().nullable(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

router.get('/', async (req, res) => {
  const { lowStock, expired, q } = req.query;
  const where = {};
  if (q) where.name = { [Op.iLike]: `%${q}%` };
  let medicines = await Medicine.findAll({ where, order: [['name', 'ASC']] });

  if (lowStock === 'true') {
    medicines = medicines.filter((m) => m.quantity <= m.lowStockThreshold);
  }
  if (expired === 'true') {
    const today = new Date().toISOString().slice(0, 10);
    medicines = medicines.filter((m) => m.expiryDate && m.expiryDate < today);
  }

  res.json(medicines);
});

router.post('/', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = medicineSchema.parse(req.body);
  const medicine = await Medicine.create(data);

  await recordAudit({ userId: req.user.id, action: 'MEDICINE_CREATED', recordType: 'Medicine', recordId: medicine.id });

  res.status(201).json(medicine);
});

router.put('/:id', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const medicine = await Medicine.findByPk(req.params.id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found.' });

  const data = medicineSchema.partial().parse(req.body);
  await medicine.update(data);

  await recordAudit({ userId: req.user.id, action: 'MEDICINE_UPDATED', recordType: 'Medicine', recordId: medicine.id });

  res.json(medicine);
});

router.patch('/:id/stock', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const schema = z.object({ adjustBy: z.number().int(), reason: z.string().optional() });
  const { adjustBy, reason } = schema.parse(req.body);

  const medicine = await Medicine.findByPk(req.params.id);
  if (!medicine) return res.status(404).json({ error: 'Medicine not found.' });

  const newQty = medicine.quantity + adjustBy;
  if (newQty < 0) return res.status(400).json({ error: 'Stock cannot go below zero.' });

  medicine.quantity = newQty;
  await medicine.save();

  await recordAudit({
    userId: req.user.id,
    action: 'MEDICINE_STOCK_ADJUSTED',
    recordType: 'Medicine',
    recordId: medicine.id,
    details: { adjustBy, reason },
  });

  res.json(medicine);
});

module.exports = router;
