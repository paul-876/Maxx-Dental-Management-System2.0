const express = require('express');
const { z } = require('zod');
const { DentalRecord, TreatmentPlan, TreatmentRecord, Patient, Dentist } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// ---------- Dental Records (examination + diagnosis) ----------

const dentalRecordSchema = z.object({
  patientId: z.string().uuid(),
  dentistId: z.string().uuid(),
  complaint: z.string().optional().nullable(),
  examinationFindings: z.string().optional().nullable(),
  dentalCondition: z.string().optional().nullable(),
  observations: z.string().optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  diagnosisNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

router.get('/records', async (req, res) => {
  const { patientId } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  const records = await DentalRecord.findAll({ where, order: [['recordDate', 'DESC']] });
  res.json(records);
});

router.post('/records', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = dentalRecordSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const record = await DentalRecord.create(data);

  await recordAudit({
    userId: req.user.id,
    action: 'DENTAL_RECORD_CREATED',
    recordType: 'DentalRecord',
    recordId: record.id,
  });

  res.status(201).json(record);
});

router.put('/records/:id', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const record = await DentalRecord.findByPk(req.params.id);
  if (!record) return res.status(404).json({ error: 'Dental record not found.' });

  const data = dentalRecordSchema.partial().parse(req.body);
  await record.update(data);

  await recordAudit({
    userId: req.user.id,
    action: 'DENTAL_RECORD_UPDATED',
    recordType: 'DentalRecord',
    recordId: record.id,
  });

  res.json(record);
});

// ---------- Treatment Plans ----------

const treatmentPlanSchema = z.object({
  patientId: z.string().uuid(),
  dentistId: z.string().uuid(),
  treatmentName: z.string().min(1),
  description: z.string().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  requiredAppointments: z.number().int().optional().nullable(),
  followUpInfo: z.string().optional().nullable(),
});

router.get('/treatment-plans', async (req, res) => {
  const { patientId } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  const plans = await TreatmentPlan.findAll({ where, order: [['createdAt', 'DESC']] });
  res.json(plans);
});

router.post('/treatment-plans', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = treatmentPlanSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const plan = await TreatmentPlan.create(data);

  await recordAudit({
    userId: req.user.id,
    action: 'TREATMENT_PLAN_CREATED',
    recordType: 'TreatmentPlan',
    recordId: plan.id,
  });

  res.status(201).json(plan);
});

router.put('/treatment-plans/:id', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const plan = await TreatmentPlan.findByPk(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Treatment plan not found.' });

  const data = treatmentPlanSchema.partial().parse(req.body);
  await plan.update(data);

  await recordAudit({
    userId: req.user.id,
    action: 'TREATMENT_PLAN_UPDATED',
    recordType: 'TreatmentPlan',
    recordId: plan.id,
  });

  res.json(plan);
});

// ---------- Treatment Records ----------

const treatmentRecordSchema = z.object({
  patientId: z.string().uuid(),
  dentistId: z.string().uuid(),
  treatmentPlanId: z.string().uuid().optional().nullable(),
  treatment: z.string().min(1),
  notes: z.string().optional().nullable(),
  status: z.enum(['COMPLETED', 'FOLLOW_UP_REQUIRED']).optional(),
});

router.get('/treatment-records', async (req, res) => {
  const { patientId } = req.query;
  const where = {};
  if (patientId) where.patientId = patientId;
  const records = await TreatmentRecord.findAll({ where, order: [['treatmentDate', 'DESC']] });
  res.json(records);
});

router.post('/treatment-records', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = treatmentRecordSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  const record = await TreatmentRecord.create(data);

  await recordAudit({
    userId: req.user.id,
    action: 'TREATMENT_RECORD_CREATED',
    recordType: 'TreatmentRecord',
    recordId: record.id,
  });

  res.status(201).json(record);
});

// Mark dentist's work on the current visit as complete (used before transferring onward)
router.post('/complete-treatment', authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN), async (req, res) => {
  const schema = z.object({ patientId: z.string().uuid() });
  const { patientId } = schema.parse(req.body);

  const { PATIENT_STATUS } = require('../utils/constants');
  const patient = await Patient.findByPk(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  patient.status = PATIENT_STATUS.TREATMENT_COMPLETED;
  await patient.save();

  await recordAudit({ userId: req.user.id, action: 'TREATMENT_MARKED_COMPLETE', recordType: 'Patient', recordId: patient.id });

  res.json({ patient });
});

module.exports = router;
