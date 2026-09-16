const express = require('express');
const { z } = require('zod');
const { Appointment, Patient, Dentist, User } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../services/notificationService');
const { ROLES, APPOINTMENT_STATUS } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

const createSchema = z.object({
  patientId: z.string().uuid(),
  dentistId: z.string().uuid().optional().nullable(),
  appointmentDate: z.string().min(1),
  appointmentTime: z.string().min(1),
  reason: z.string().optional().nullable(),
});

const includeOpts = [
  { model: Patient, as: 'patient' },
  { model: Dentist, as: 'dentist', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone', 'email'] }] },
];

router.get('/', async (req, res) => {
  const { date, dentistId, patientId, status } = req.query;
  const where = {};
  if (date) where.appointmentDate = date;
  if (dentistId) where.dentistId = dentistId;
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;

  const appointments = await Appointment.findAll({
    where,
    include: includeOpts,
    order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
  });
  res.json(appointments);
});

router.get('/:id', async (req, res) => {
  const appt = await Appointment.findByPk(req.params.id, { include: includeOpts });
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  res.json(appt);
});

// Patients book via the same endpoint in this phase (patient app comes later);
// receptionists create on behalf of patients too.
router.post('/', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const data = createSchema.parse(req.body);

  const patient = await Patient.findByPk(data.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });

  if (data.dentistId) {
    const dentist = await Dentist.findByPk(data.dentistId);
    if (!dentist) return res.status(404).json({ error: 'Dentist not found.' });
  }

  const appointment = await Appointment.create({
    ...data,
    createdById: req.user.id,
  });

  await recordAudit({
    userId: req.user.id,
    action: 'APPOINTMENT_CREATED',
    recordType: 'Appointment',
    recordId: appointment.id,
  });

  await notify({
    patientId: patient.id,
    title: 'Appointment Confirmed',
    message: `Your appointment on ${data.appointmentDate} at ${data.appointmentTime} has been booked.`,
    channel: 'SMS',
  });

  const withIncludes = await Appointment.findByPk(appointment.id, { include: includeOpts });
  res.status(201).json(withIncludes);
});

router.put('/:id', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN), async (req, res) => {
  const appt = await Appointment.findByPk(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  const data = createSchema.partial().parse(req.body);
  await appt.update(data);

  await recordAudit({
    userId: req.user.id,
    action: 'APPOINTMENT_UPDATED',
    recordType: 'Appointment',
    recordId: appt.id,
  });

  const withIncludes = await Appointment.findByPk(appt.id, { include: includeOpts });
  res.json(withIncludes);
});

router.patch('/:id/status', authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN, ROLES.DENTIST), async (req, res) => {
  const schema = z.object({ status: z.enum(Object.values(APPOINTMENT_STATUS)) });
  const { status } = schema.parse(req.body);

  const appt = await Appointment.findByPk(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  appt.status = status;
  await appt.save();

  await recordAudit({
    userId: req.user.id,
    action: 'APPOINTMENT_STATUS_CHANGED',
    recordType: 'Appointment',
    recordId: appt.id,
    details: { status },
  });

  res.json(appt);
});

module.exports = router;
