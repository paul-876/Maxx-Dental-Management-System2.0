const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const {
  Patient,
  Appointment,
  DentalRecord,
  TreatmentPlan,
  TreatmentRecord,
  Prescription,
  PrescriptionItem,
  Medicine,
  Payment,
  Dentist,
  User,
} = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { normalizePhone } = require('../utils/phone');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// Treat an empty string from an optional <select>/<input> the same as "not provided".
const emptyToUndefined = (val) => (val === '' ? undefined : val);

const patientSchema = z.object({
  phoneNumber: z.string().min(7, 'A valid phone number is required.'),
  name: z.string().min(1, 'Name is required.'),
  gender: z.preprocess(emptyToUndefined, z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable()),
  dateOfBirth: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  medicalHistory: z.string().optional().nullable(),
  dentalHistory: z.string().optional().nullable(),
});

// Search / list patients (by phone or name)
router.get('/', async (req, res) => {
  const { q, phone } = req.query;
  const where = {};
  if (phone) {
    where.phoneNumber = normalizePhone(phone);
  } else if (q) {
    const normalizedQuery = normalizePhone(q);
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { phoneNumber: { [Op.iLike]: `%${q}%` } },
      { phoneNumber: normalizedQuery },
    ];
  }
  const patients = await Patient.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  res.json(patients);
});

router.post('/', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = patientSchema.parse(req.body);
  const phoneNumber = normalizePhone(data.phoneNumber);

  const existing = await Patient.findOne({ where: { phoneNumber } });
  if (existing) {
    return res.status(409).json({
      error: 'This phone number is already registered. Please search for the existing patient record.',
      patientId: existing.id,
    });
  }

  const patient = await Patient.create({
    ...data,
    phoneNumber,
    email: data.email || null,
    registeredById: req.user.id,
  });

  await recordAudit({
    userId: req.user.id,
    action: 'PATIENT_REGISTERED',
    recordType: 'Patient',
    recordId: patient.id,
  });

  res.status(201).json(patient);
});

router.get('/:id', async (req, res) => {
  const patient = await Patient.findByPk(req.params.id, {
    include: [
      { model: Appointment, as: 'appointments', include: [{ model: Dentist, as: 'dentist', include: [{ model: User, as: 'user', attributes: ['id', 'name'] }] }] },
      { model: DentalRecord, as: 'dentalRecords' },
      { model: TreatmentPlan, as: 'treatmentPlans' },
      { model: TreatmentRecord, as: 'treatmentRecords' },
      {
        model: Prescription,
        as: 'prescriptions',
        include: [{ model: PrescriptionItem, as: 'items', include: [{ model: Medicine, as: 'medicine' }] }],
      },
      { model: Payment, as: 'payments' },
    ],
  });
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  res.json(patient);
});

router.put('/:id', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const patient = await Patient.findByPk(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const data = patientSchema.partial().parse(req.body);
  if (data.phoneNumber) {
    const normalized = normalizePhone(data.phoneNumber);
    if (normalized !== patient.phoneNumber) {
      const dupe = await Patient.findOne({ where: { phoneNumber: normalized } });
      if (dupe) {
        return res.status(409).json({
          error: 'This phone number is already registered. Please search for the existing patient record.',
          patientId: dupe.id,
        });
      }
    }
    data.phoneNumber = normalized;
  }

  await patient.update(data);

  await recordAudit({
    userId: req.user.id,
    action: 'PATIENT_UPDATED',
    recordType: 'Patient',
    recordId: patient.id,
  });

  res.json(patient);
});

module.exports = router;
