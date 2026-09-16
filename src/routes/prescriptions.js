const express = require('express');
const { z } = require('zod');
const { sequelize, Prescription, PrescriptionItem, Medicine, Patient, Dentist } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../services/notificationService');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

const itemSchema = z.object({
  medicineId: z.string().uuid(),
  dosage: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  instructions: z.string().optional().nullable(),
});

const createSchema = z.object({
  patientId: z.string().uuid(),
  dentistId: z.string().uuid(),
  instructions: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, 'At least one medicine item is required.'),
});

const includeOpts = [
  { model: Patient, as: 'patient' },
  { model: PrescriptionItem, as: 'items', include: [{ model: Medicine, as: 'medicine' }] },
];

router.get('/', async (req, res) => {
  const { patientId, status } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  const prescriptions = await Prescription.findAll({ where, include: includeOpts, order: [['prescriptionDate', 'DESC']] });
  res.json(prescriptions);
});

router.post('/', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = createSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const result = await sequelize.transaction(async (t) => {
    const prescription = await Prescription.create(
      { patientId: data.patientId, dentistId: data.dentistId, instructions: data.instructions || null },
      { transaction: t }
    );
    for (const item of data.items) {
      await PrescriptionItem.create({ ...item, prescriptionId: prescription.id }, { transaction: t });
    }
    return prescription;
  });

  await recordAudit({ userId: req.user.id, action: 'PRESCRIPTION_CREATED', recordType: 'Prescription', recordId: result.id });

  const withIncludes = await Prescription.findByPk(result.id, { include: includeOpts });
  res.status(201).json(withIncludes);
});

// Pharmacy dispenses one item at a time (or the whole prescription)
router.patch('/items/:itemId/dispense', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const item = await PrescriptionItem.findByPk(req.params.itemId, { include: [{ model: Medicine, as: 'medicine' }] });
  if (!item) return res.status(404).json({ error: 'Prescription item not found.' });
  if (item.dispensed) return res.status(400).json({ error: 'This item has already been dispensed.' });

  const medicine = item.medicine;
  if (!medicine) return res.status(400).json({ error: 'Medicine record missing for this item.' });
  if (medicine.quantity < 1) {
    return res.status(400).json({ error: `${medicine.name} is out of stock.` });
  }

  await sequelize.transaction(async (t) => {
    medicine.quantity -= 1;
    await medicine.save({ transaction: t });
    item.dispensed = true;
    item.dispensedAt = new Date();
    item.dispensedById = req.user.id;
    await item.save({ transaction: t });
  });

  // Update prescription-level status
  const prescription = await Prescription.findByPk(item.prescriptionId, { include: [{ model: PrescriptionItem, as: 'items' }] });
  const allDispensed = prescription.items.every((i) => i.dispensed);
  const anyDispensed = prescription.items.some((i) => i.dispensed);
  prescription.status = allDispensed ? 'DISPENSED' : anyDispensed ? 'PARTIALLY_DISPENSED' : 'PENDING';
  await prescription.save();

  await recordAudit({
    userId: req.user.id,
    action: 'MEDICINE_DISPENSED',
    recordType: 'PrescriptionItem',
    recordId: item.id,
    details: { medicineId: medicine.id },
  });

  res.json({ item, prescriptionStatus: prescription.status });
});

// Convenience: mark whole prescription dispensed + move patient status forward
router.post('/:id/complete-dispensing', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const prescription = await Prescription.findByPk(req.params.id, { include: [{ model: PrescriptionItem, as: 'items' }, { model: Patient, as: 'patient' }] });
  if (!prescription) return res.status(404).json({ error: 'Prescription not found.' });

  const { PATIENT_STATUS } = require('../utils/constants');
  const patient = prescription.patient;
  if (patient) {
    patient.status = PATIENT_STATUS.MEDICINE_DISPENSED;
    await patient.save();
    await notify({ patientId: patient.id, title: 'Medication Ready', message: 'Your prescribed medication has been dispensed.', channel: 'SMS' });
  }

  await recordAudit({ userId: req.user.id, action: 'PRESCRIPTION_DISPENSING_COMPLETED', recordType: 'Prescription', recordId: prescription.id });

  res.json({ prescription, patient });
});

module.exports = router;
