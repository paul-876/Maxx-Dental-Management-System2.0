const express = require('express');
const { Op, fn, col, literal } = require('sequelize');
const {
  Patient,
  Appointment,
  Payment,
  Invoice,
  Medicine,
  PrescriptionItem,
  TreatmentRecord,
  Dentist,
  User,
} = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

function dateRange(days) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// True currently-outstanding total: ad-hoc payment balances (the quick
// single-payment flow) plus the balance of every open (unpaid/partially
// paid) formal Invoice. A Payment linked to an invoice only ever mirrors
// that invoice's balance *at the moment it was recorded*, so once a second
// payment is applied to the same invoice, earlier payment rows are stale —
// they must be excluded here rather than summed directly.
async function computeOutstandingTotal() {
  const [adHocTotal, invoiceTotal] = await Promise.all([
    Payment.sum('balance', { where: { balance: { [Op.gt]: 0 }, invoiceId: null } }),
    Invoice.sum('balance', { where: { status: { [Op.in]: ['UNPAID', 'PARTIALLY_PAID'] } } }),
  ]);
  return (adHocTotal || 0) + (invoiceTotal || 0);
}

function toCsv(rows, columns) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(c.render ? c.render(row) : row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ---------- Patient reports ----------
router.get('/patients', async (req, res) => {
  const totalPatients = await Patient.count();
  const newPatients7d = await Patient.count({ where: { createdAt: { [Op.gte]: dateRange(7) } } });
  const newPatients30d = await Patient.count({ where: { createdAt: { [Op.gte]: dateRange(30) } } });

  // "Returning" = patients with more than one appointment on record
  const appointmentCounts = await Appointment.findAll({
    attributes: ['patientId', [fn('COUNT', col('id')), 'count']],
    group: ['patientId'],
  });
  const returningPatients = appointmentCounts.filter((a) => parseInt(a.get('count'), 10) > 1).length;

  res.json({ totalPatients, newPatients7d, newPatients30d, returningPatients });
});

// ---------- Appointment reports ----------
router.get('/appointments', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [todayCount, upcoming, completed, cancelled, missed] = await Promise.all([
    Appointment.count({ where: { appointmentDate: today } }),
    Appointment.count({ where: { appointmentDate: { [Op.gt]: today }, status: 'SCHEDULED' } }),
    Appointment.count({ where: { status: 'COMPLETED' } }),
    Appointment.count({ where: { status: 'CANCELLED' } }),
    Appointment.count({ where: { status: 'MISSED' } }),
  ]);
  res.json({ today: todayCount, upcoming, completed, cancelled, missed });
});

// ---------- Financial reports ----------
router.get('/financial', async (req, res) => {
  const [daily, weekly, monthly] = await Promise.all([
    Payment.sum('amount', { where: { paymentDate: { [Op.gte]: dateRange(1) } } }),
    Payment.sum('amount', { where: { paymentDate: { [Op.gte]: dateRange(7) } } }),
    Payment.sum('amount', { where: { paymentDate: { [Op.gte]: dateRange(30) } } }),
  ]);

  const byMethod = await Payment.findAll({
    attributes: ['paymentMethod', [fn('SUM', col('amount')), 'total'], [fn('COUNT', col('id')), 'count']],
    group: ['paymentMethod'],
  });

  const outstanding = await computeOutstandingTotal();
  const totalRevenue = await Payment.sum('amount');

  res.json({
    dailyRevenue: daily || 0,
    weeklyRevenue: weekly || 0,
    monthlyRevenue: monthly || 0,
    totalRevenue: totalRevenue || 0,
    outstandingBalance: outstanding || 0,
    byPaymentMethod: byMethod.map((r) => ({
      method: r.paymentMethod,
      total: parseFloat(r.get('total')),
      count: parseInt(r.get('count'), 10),
    })),
  });
});

// Daily revenue trend, zero-filled for days with no payments — powers the
// Reports page's revenue-over-time chart.
router.get('/financial/trend', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const start = dateRange(days - 1);

  const rows = await Payment.findAll({
    // Sequelize is configured with underscored:true, so raw col()/fn() refs
    // need the actual snake_case DB column name — payment_date, not paymentDate.
    attributes: [[fn('DATE', col('payment_date')), 'day'], [fn('SUM', col('amount')), 'total']],
    where: { paymentDate: { [Op.gte]: start } },
    group: [literal('1')],
    order: [literal('1 ASC')],
  });

  const byDay = new Map(rows.map((r) => [isoDay(r.get('day')), parseFloat(r.get('total'))]));

  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = isoDay(d);
    trend.push({ date: key, total: byDay.get(key) || 0 });
  }

  res.json({ days, trend });
});

// Revenue grouped by service description (from the quick-payment flow's
// free-text field, and from formal invoices' itemized line items joined
// into a summary string when a payment is created against one).
router.get('/financial/by-service', async (req, res) => {
  const rows = await Payment.findAll({
    attributes: [
      [fn('COALESCE', col('service_description'), 'Unspecified'), 'service'],
      [fn('SUM', col('amount')), 'total'],
      [fn('COUNT', col('id')), 'count'],
    ],
    group: [literal('1')],
    order: [[literal('2'), 'DESC']],
    limit: 15,
  });

  res.json(
    rows.map((r) => ({
      service: r.get('service'),
      total: parseFloat(r.get('total')),
      count: parseInt(r.get('count'), 10),
    }))
  );
});

// Revenue attributed to each dentist. A Payment has no direct dentist link
// (a cashier records it, not a dentist), so each payment is attributed to
// whichever dentist most recently treated that patient on or before the
// payment date — the same attribution a clinic would use manually.
router.get('/financial/by-dentist', async (req, res) => {
  const [payments, treatmentRecords, dentists] = await Promise.all([
    Payment.findAll({ attributes: ['id', 'patientId', 'amount', 'paymentDate'] }),
    TreatmentRecord.findAll({ attributes: ['patientId', 'dentistId', 'treatmentDate'], order: [['treatmentDate', 'ASC']] }),
    Dentist.findAll({ include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] }),
  ]);

  // Latest treatment record per patient at-or-before each payment's date.
  const recordsByPatient = new Map();
  treatmentRecords.forEach((r) => {
    const list = recordsByPatient.get(r.patientId) || [];
    list.push(r);
    recordsByPatient.set(r.patientId, list);
  });

  const revenueByDentist = new Map();
  let unattributed = 0;

  payments.forEach((p) => {
    const records = recordsByPatient.get(p.patientId) || [];
    const applicable = records.filter((r) => new Date(r.treatmentDate) <= new Date(p.paymentDate));
    const latest = applicable[applicable.length - 1];
    if (!latest) {
      unattributed += parseFloat(p.amount);
      return;
    }
    revenueByDentist.set(latest.dentistId, (revenueByDentist.get(latest.dentistId) || 0) + parseFloat(p.amount));
  });

  const results = dentists.map((d) => ({
    dentistId: d.id,
    name: d.user?.name,
    revenue: Math.round((revenueByDentist.get(d.id) || 0) * 100) / 100,
  }));
  results.sort((a, b) => b.revenue - a.revenue);

  res.json({ byDentist: results, unattributed: Math.round(unattributed * 100) / 100 });
});

// Every patient currently carrying an outstanding balance, for follow-up —
// merges the quick-payment flow's ad-hoc balances with open invoices.
router.get('/outstanding-patients', async (req, res) => {
  const [adHocPayments, openInvoices] = await Promise.all([
    Payment.findAll({
      where: { balance: { [Op.gt]: 0 }, invoiceId: null },
      include: [{ model: Patient, as: 'patient' }],
      order: [['paymentDate', 'ASC']],
    }),
    Invoice.findAll({
      where: { status: { [Op.in]: ['UNPAID', 'PARTIALLY_PAID'] } },
      include: [{ model: Patient, as: 'patient' }],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  const byPatient = new Map();
  const upsert = (patient, amount, since) => {
    if (!patient) return;
    const existing = byPatient.get(patient.id) || {
      patientId: patient.id,
      name: patient.name,
      phoneNumber: patient.phoneNumber,
      totalOwed: 0,
      oldestSince: since,
    };
    existing.totalOwed = Math.round((existing.totalOwed + amount) * 100) / 100;
    if (new Date(since) < new Date(existing.oldestSince)) existing.oldestSince = since;
    byPatient.set(patient.id, existing);
  };

  adHocPayments.forEach((p) => upsert(p.patient, parseFloat(p.balance), p.paymentDate));
  openInvoices.forEach((inv) => upsert(inv.patient, parseFloat(inv.balance), inv.createdAt));

  const list = Array.from(byPatient.values()).sort((a, b) => b.totalOwed - a.totalOwed);
  res.json(list);
});

// ---------- CSV exports ----------
router.get('/export/payments.csv', async (req, res) => {
  const payments = await Payment.findAll({
    include: [{ model: Patient, as: 'patient' }, { model: User, as: 'cashier', attributes: ['name'] }, { model: Invoice, as: 'invoice', attributes: ['invoiceNumber'] }],
    order: [['paymentDate', 'DESC']],
  });

  const csv = toCsv(payments, [
    { header: 'Date', render: (p) => isoDay(p.paymentDate) },
    { header: 'Patient', render: (p) => p.patient?.name },
    { header: 'Phone', render: (p) => p.patient?.phoneNumber },
    { header: 'Service', render: (p) => p.serviceDescription || '' },
    { header: 'Invoice #', render: (p) => p.invoice?.invoiceNumber || '' },
    { header: 'Amount', render: (p) => p.amount },
    { header: 'Method', render: (p) => p.paymentMethod },
    { header: 'Balance', render: (p) => p.balance },
    { header: 'Cashier', render: (p) => p.cashier?.name || '' },
  ]);

  sendCsv(res, `payments-${isoDay(new Date())}.csv`, csv);
});

router.get('/export/invoices.csv', async (req, res) => {
  const invoices = await Invoice.findAll({
    include: [{ model: Patient, as: 'patient' }],
    order: [['createdAt', 'DESC']],
  });

  const csv = toCsv(invoices, [
    { header: 'Invoice #', render: (i) => i.invoiceNumber },
    { header: 'Date', render: (i) => isoDay(i.createdAt) },
    { header: 'Patient', render: (i) => i.patient?.name },
    { header: 'Phone', render: (i) => i.patient?.phoneNumber },
    { header: 'Subtotal', render: (i) => i.subtotal },
    { header: 'Discount', render: (i) => i.discount },
    { header: 'Tax', render: (i) => i.tax },
    { header: 'Total', render: (i) => i.totalAmount },
    { header: 'Paid', render: (i) => i.amountPaid },
    { header: 'Balance', render: (i) => i.balance },
    { header: 'Status', render: (i) => i.status },
  ]);

  sendCsv(res, `invoices-${isoDay(new Date())}.csv`, csv);
});

// ---------- Dentist reports ----------
router.get('/dentists', async (req, res) => {
  const dentists = await Dentist.findAll({ include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] });

  const results = await Promise.all(
    dentists.map(async (d) => {
      const [patientsHandled, treatmentsCompleted, appointments] = await Promise.all([
        Appointment.count({ where: { dentistId: d.id }, distinct: true, col: 'patientId' }),
        TreatmentRecord.count({ where: { dentistId: d.id } }),
        Appointment.count({ where: { dentistId: d.id } }),
      ]);
      return {
        dentistId: d.id,
        name: d.user?.name,
        status: d.status,
        patientsHandled,
        treatmentsCompleted,
        appointments,
      };
    })
  );

  res.json(results);
});

// ---------- Pharmacy reports ----------
router.get('/pharmacy', async (req, res) => {
  const dispensedCount = await PrescriptionItem.count({ where: { dispensed: true } });
  const medicines = await Medicine.findAll();
  const today = new Date().toISOString().slice(0, 10);

  const lowStock = medicines.filter((m) => m.quantity <= m.lowStockThreshold);
  const expired = medicines.filter((m) => m.expiryDate && m.expiryDate < today);

  res.json({
    medicineDispensed: dispensedCount,
    currentStock: medicines.map((m) => ({ id: m.id, name: m.name, quantity: m.quantity })),
    lowStock: lowStock.map((m) => ({ id: m.id, name: m.name, quantity: m.quantity })),
    expired: expired.map((m) => ({ id: m.id, name: m.name, expiryDate: m.expiryDate })),
  });
});

// ---------- Super Admin dashboard summary ----------
router.get('/dashboard', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [
    totalPatients,
    newPatientsToday,
    todaysAppointments,
    upcomingAppointments,
    activeDentists,
    totalStaff,
    todaysPayments,
    outstanding,
    pharmacyActivityToday,
  ] = await Promise.all([
    Patient.count(),
    Patient.count({ where: { createdAt: { [Op.gte]: dateRange(0) } } }),
    Appointment.count({ where: { appointmentDate: today } }),
    Appointment.count({ where: { appointmentDate: { [Op.gt]: today }, status: 'SCHEDULED' } }),
    Dentist.count({ where: { status: 'ACTIVE' } }),
    User.count(),
    Payment.sum('amount', { where: { paymentDate: { [Op.gte]: dateRange(1) } } }),
    computeOutstandingTotal(),
    PrescriptionItem.count({ where: { dispensed: true, dispensedAt: { [Op.gte]: dateRange(1) } } }),
  ]);

  res.json({
    totalPatients,
    newPatientsToday,
    todaysAppointments,
    upcomingAppointments,
    activeDentists,
    totalStaff,
    todaysPayments: todaysPayments || 0,
    outstandingPayments: outstanding || 0,
    pharmacyActivityToday,
  });
});

module.exports = router;
