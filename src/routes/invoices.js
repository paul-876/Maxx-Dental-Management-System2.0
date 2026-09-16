const express = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const { Invoice, InvoiceItem, Patient, User, Payment, Receipt, sequelize } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { generateInvoiceNumber } = require('../utils/sequenceNumbers');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);
router.use(authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN));

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0),
});

const createSchema = z.object({
  patientId: z.string().uuid(),
  items: z.array(itemSchema).min(1, 'Add at least one billable item.'),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

const includeFull = [
  { model: Patient, as: 'patient' },
  { model: InvoiceItem, as: 'items' },
  { model: User, as: 'createdBy', attributes: ['id', 'name'] },
  {
    model: Payment,
    as: 'payments',
    include: [
      { model: User, as: 'cashier', attributes: ['id', 'name'] },
      { model: Receipt, as: 'receipt' },
    ],
  },
];

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

router.get('/', async (req, res) => {
  const { patientId, status } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;

  const invoices = await Invoice.findAll({
    where,
    include: includeFull,
    order: [['createdAt', 'DESC']],
    limit: 300,
  });
  res.json(invoices);
});

router.get('/:id', async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id, { include: includeFull });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(invoice);
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const subtotal = round2(data.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0));
  const totalAmount = round2(Math.max(subtotal - data.discount + data.tax, 0));

  const result = await sequelize.transaction(async (t) => {
    const invoiceNumber = await generateInvoiceNumber(Invoice);
    const invoice = await Invoice.create(
      {
        patientId: data.patientId,
        invoiceNumber,
        subtotal,
        discount: data.discount,
        tax: data.tax,
        totalAmount,
        amountPaid: 0,
        balance: totalAmount,
        status: 'UNPAID',
        notes: data.notes || null,
        createdById: req.user.id,
      },
      { transaction: t }
    );

    await InvoiceItem.bulkCreate(
      data.items.map((it) => ({
        invoiceId: invoice.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: round2(it.quantity * it.unitPrice),
      })),
      { transaction: t }
    );

    return invoice;
  });

  await recordAudit({
    userId: req.user.id,
    action: 'INVOICE_CREATED',
    recordType: 'Invoice',
    recordId: result.id,
    details: { invoiceNumber: result.invoiceNumber, totalAmount, patientId: data.patientId },
  });

  const full = await Invoice.findByPk(result.id, { include: includeFull });
  res.status(201).json(full);
});

router.patch('/:id/void', async (req, res) => {
  const invoice = await Invoice.findByPk(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (invoice.status === 'VOID') return res.status(400).json({ error: 'Invoice is already void.' });
  if (parseFloat(invoice.amountPaid) > 0) {
    return res.status(400).json({ error: 'Cannot void an invoice that already has payments applied to it.' });
  }

  invoice.status = 'VOID';
  invoice.voidedAt = new Date();
  await invoice.save();

  await recordAudit({
    userId: req.user.id,
    action: 'INVOICE_VOIDED',
    recordType: 'Invoice',
    recordId: invoice.id,
    details: { invoiceNumber: invoice.invoiceNumber },
  });

  res.json(invoice);
});

module.exports = router;
