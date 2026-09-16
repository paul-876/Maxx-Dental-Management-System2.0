const express = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const { Payment, Receipt, Patient, User, Appointment, Invoice, InvoiceItem, sequelize } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../services/notificationService');
const { initiateStkPush } = require('../services/mpesaService');
const { generateReceiptNumber } = require('../utils/sequenceNumbers');
const { ROLES, PATIENT_STATUS, PAYMENT_METHODS } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

const createSchema = z.object({
  patientId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(), // when set, this payment applies against a formal Invoice
  amountDue: z.number().min(0).optional(), // total owed for the service; defaults to amount (i.e. paid in full). Ignored when invoiceId is set — the invoice's own balance is used instead.
  amount: z.number().positive(),
  paymentMethod: z.enum(Object.values(PAYMENT_METHODS)),
  serviceDescription: z.string().optional().nullable(),
  transactionReference: z.string().optional().nullable(),
});

function invoiceStatus(balance, amountPaid) {
  if (balance <= 0) return 'PAID';
  if (amountPaid > 0) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

router.get('/', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const { patientId, from, to } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  if (from || to) {
    where.paymentDate = {};
    if (from) where.paymentDate[Op.gte] = new Date(from);
    if (to) where.paymentDate[Op.lte] = new Date(to);
  }
  const payments = await Payment.findAll({
    where,
    include: [
      { model: Patient, as: 'patient' },
      { model: User, as: 'cashier', attributes: ['id', 'name'] },
      { model: Receipt, as: 'receipt' },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber', 'status'] },
    ],
    order: [['paymentDate', 'DESC']],
  });
  res.json(payments);
});

// Total outstanding for a patient, combining the quick single-payment flow
// (ad-hoc Payment.balance) with any unpaid/partially-paid formal Invoices.
// A payment linked to an invoice mirrors the invoice's balance rather than
// carrying its own, so it's excluded here to avoid double-counting.
router.get('/outstanding/:patientId', async (req, res) => {
  const [adHocPayments, openInvoices] = await Promise.all([
    Payment.findAll({
      where: { patientId: req.params.patientId, balance: { [Op.gt]: 0 }, invoiceId: null },
    }),
    Invoice.findAll({
      where: { patientId: req.params.patientId, status: { [Op.in]: ['UNPAID', 'PARTIALLY_PAID'] } },
      include: [{ model: InvoiceItem, as: 'items' }],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  const adHocTotal = adHocPayments.reduce((sum, p) => sum + parseFloat(p.balance), 0);
  const invoiceTotal = openInvoices.reduce((sum, inv) => sum + parseFloat(inv.balance), 0);

  res.json({
    totalOutstanding: round2(adHocTotal + invoiceTotal),
    payments: adHocPayments,
    invoices: openInvoices,
  });
});

router.post('/', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = createSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  let invoice = null;
  if (data.invoiceId) {
    invoice = await Invoice.findByPk(data.invoiceId, { include: [{ model: InvoiceItem, as: 'items' }] });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.patientId !== data.patientId) {
      return res.status(400).json({ error: 'This invoice does not belong to the given patient.' });
    }
    if (invoice.status === 'VOID') return res.status(400).json({ error: 'This invoice has been voided.' });
    if (invoice.status === 'PAID') return res.status(400).json({ error: 'This invoice is already fully paid.' });
    if (data.amount > parseFloat(invoice.balance) + 0.01) {
      return res.status(400).json({ error: `Amount exceeds the invoice balance of ${invoice.balance}.` });
    }
  }

  let transactionReference = data.transactionReference || null;

  if (data.paymentMethod === PAYMENT_METHODS.MPESA) {
    const stk = await initiateStkPush({
      phoneNumber: patient.phoneNumber,
      amount: data.amount,
      accountReference: patient.id,
    });
    transactionReference = transactionReference || stk.transactionReference;
  }

  // Invoice-linked payments use the invoice's own balance as the amount due;
  // the quick-payment flow (no invoice) keeps its original amountDue/amount logic untouched.
  const amountDue = invoice ? parseFloat(invoice.balance) : data.amountDue ?? data.amount;
  const balance = invoice ? round2(parseFloat(invoice.balance) - data.amount) : Math.max(amountDue - data.amount, 0);

  const defaultServiceDescription = invoice
    ? invoice.items.map((it) => it.description).join(', ').slice(0, 180)
    : null;

  const result = await sequelize.transaction(async (t) => {
    const payment = await Payment.create(
      {
        patientId: data.patientId,
        invoiceId: invoice ? invoice.id : null,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        transactionReference,
        cashierId: req.user.id,
        serviceDescription: data.serviceDescription || defaultServiceDescription,
        balance: Math.max(balance, 0),
      },
      { transaction: t }
    );

    if (invoice) {
      invoice.amountPaid = round2(parseFloat(invoice.amountPaid) + data.amount);
      invoice.balance = Math.max(round2(parseFloat(invoice.totalAmount) - invoice.amountPaid), 0);
      invoice.status = invoiceStatus(invoice.balance, invoice.amountPaid);
      await invoice.save({ transaction: t });
    }

    return payment;
  });

  const receiptNumber = await generateReceiptNumber(Receipt);
  const receipt = await Receipt.create({ paymentId: result.id, receiptNumber });

  patient.status = Math.max(balance, 0) > 0 ? PATIENT_STATUS.PAYMENT_PENDING : PATIENT_STATUS.PAYMENT_COMPLETED;
  await patient.save();

  await recordAudit({
    userId: req.user.id,
    action: 'PAYMENT_RECORDED',
    recordType: 'Payment',
    recordId: result.id,
    details: { amount: data.amount, method: data.paymentMethod, invoiceId: invoice?.id || null },
  });

  await notify({
    patientId: patient.id,
    title: 'Payment Received',
    message: `We received your payment of ${data.amount}. Receipt: ${receiptNumber}.`,
    channel: 'SMS',
  });

  res.status(201).json({ payment: result, receipt, patient, invoice });
});

router.get('/:id/receipt', async (req, res) => {
  const payment = await Payment.findByPk(req.params.id, {
    include: [
      { model: Patient, as: 'patient' },
      { model: User, as: 'cashier', attributes: ['id', 'name'] },
      { model: Receipt, as: 'receipt' },
      { model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNumber'] },
    ],
  });
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (!payment.receipt) return res.status(404).json({ error: 'Receipt not found for this payment.' });

  const nextAppointment = await Appointment.findOne({
    where: {
      patientId: payment.patientId,
      status: 'SCHEDULED',
      appointmentDate: { [Op.gte]: new Date().toISOString().slice(0, 10) },
    },
    order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
    include: [{ model: require('../models').Dentist, as: 'dentist', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] }],
  });

  res.json({
    clinic: {
      name: process.env.CLINIC_NAME,
      phone: process.env.CLINIC_PHONE,
      email: process.env.CLINIC_EMAIL,
      address: process.env.CLINIC_ADDRESS,
    },
    receiptNumber: payment.receipt.receiptNumber,
    generatedAt: payment.receipt.generatedAt,
    patient: { name: payment.patient.name, phoneNumber: payment.patient.phoneNumber },
    service: payment.serviceDescription,
    invoiceNumber: payment.invoice?.invoiceNumber || null,
    amountPaid: payment.amount,
    paymentMethod: payment.paymentMethod,
    balance: payment.balance,
    cashier: payment.cashier?.name,
    paymentDate: payment.paymentDate,
    nextAppointment: nextAppointment
      ? {
          date: nextAppointment.appointmentDate,
          time: nextAppointment.appointmentTime,
          dentist: nextAppointment.dentist?.user?.name || 'Assigned Dentist',
        }
      : null,
  });
});

module.exports = router;
