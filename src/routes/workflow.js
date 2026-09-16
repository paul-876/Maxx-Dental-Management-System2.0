const express = require('express');
const { z } = require('zod');
const { Patient, PatientTransfer, User, Dentist } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAudit } = require('../utils/audit');
const { notify } = require('../services/notificationService');
const { generateTicketNumber } = require('../utils/sequenceNumbers');
const { ROLES, PATIENT_STATUS, DEPARTMENTS } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// Which patient statuses "belong" in each department's queue
const DEPARTMENT_STATUSES = {
  [DEPARTMENTS.FRONT_DESK]: [PATIENT_STATUS.REGISTERED, PATIENT_STATUS.WAITING_FRONT_DESK],
  [DEPARTMENTS.DENTIST]: [PATIENT_STATUS.SENT_TO_DENTIST, PATIENT_STATUS.WAITING_DENTIST, PATIENT_STATUS.WITH_DENTIST],
  [DEPARTMENTS.CASHIER]: [PATIENT_STATUS.SENT_TO_CASHIER, PATIENT_STATUS.PAYMENT_PENDING],
  [DEPARTMENTS.PHARMACY]: [PATIENT_STATUS.SENT_TO_PHARMACY, PATIENT_STATUS.WAITING_PHARMACY],
};

async function createTransfer({
  patientId,
  senderId,
  receiverId,
  fromDepartment,
  toDepartment,
  previousStatus,
  newStatus,
  reason,
  ticketNumber,
}) {
  return PatientTransfer.create({
    patientId,
    senderId: senderId || null,
    receiverId: receiverId || null,
    fromDepartment: fromDepartment || null,
    toDepartment,
    previousStatus,
    newStatus,
    reason: reason || null,
    ticketNumber: ticketNumber || null,
  });
}

// --- Queue view for a department ---
router.get('/queue/:department', async (req, res) => {
  const department = req.params.department.toUpperCase();
  const statuses = DEPARTMENT_STATUSES[department];
  if (!statuses) return res.status(400).json({ error: 'Unknown department.' });

  const { Op } = require('sequelize');
  const where = { status: { [Op.in]: statuses } };

  let dentistFilter = req.query.dentistId;
  const patients = await Patient.findAll({
    where,
    order: [['updatedAt', 'ASC']],
  });

  // For the dentist queue, attach the most recent transfer's receiver (assigned dentist)
  const results = [];
  for (const patient of patients) {
    const lastTransfer = await PatientTransfer.findOne({
      where: { patientId: patient.id },
      order: [['transferTime', 'DESC']],
    });
    if (department === DEPARTMENTS.DENTIST && dentistFilter && lastTransfer?.receiverId !== dentistFilter) {
      continue;
    }
    results.push({
      patient,
      lastTransfer,
    });
  }

  res.json(
    results.map((r, idx) => ({
      queuePosition: idx + 1,
      ticketNumber: r.lastTransfer?.ticketNumber || null,
      patient: r.patient,
      assignedTo: r.lastTransfer?.receiverId || null,
      since: r.lastTransfer?.transferTime || r.patient.updatedAt,
    }))
  );
});

// --- Front Desk: check patient in (arrival), generates a ticket ---
router.post(
  '/checkin',
  authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN),
  async (req, res) => {
    const schema = z.object({ patientId: z.string().uuid() });
    const { patientId } = schema.parse(req.body);

    const patient = await Patient.findByPk(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const ticketNumber = await generateTicketNumber(PatientTransfer);
    const previousStatus = patient.status;
    patient.status = PATIENT_STATUS.WAITING_FRONT_DESK;
    await patient.save();

    const transfer = await createTransfer({
      patientId: patient.id,
      senderId: req.user.id,
      toDepartment: DEPARTMENTS.FRONT_DESK,
      previousStatus,
      newStatus: patient.status,
      ticketNumber,
      reason: 'Patient checked in',
    });

    await recordAudit({ userId: req.user.id, action: 'PATIENT_CHECKED_IN', recordType: 'Patient', recordId: patient.id });

    res.status(201).json({ patient, ticketNumber, transfer });
  }
);

// --- Front Desk -> Dentist ---
router.post(
  '/send-to-dentist',
  authorize(ROLES.FRONT_DESK, ROLES.SUPER_ADMIN),
  async (req, res) => {
    const schema = z.object({ patientId: z.string().uuid(), dentistId: z.string().uuid(), reason: z.string().optional() });
    const { patientId, dentistId, reason } = schema.parse(req.body);

    const patient = await Patient.findByPk(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    const dentist = await Dentist.findByPk(dentistId);
    if (!dentist) return res.status(404).json({ error: 'Dentist not found.' });
    if (dentist.status !== 'ACTIVE') return res.status(400).json({ error: 'This dentist is not active.' });

    const previousStatus = patient.status;
    patient.status = PATIENT_STATUS.SENT_TO_DENTIST;
    await patient.save();

    const transfer = await createTransfer({
      patientId: patient.id,
      senderId: req.user.id,
      receiverId: dentist.userId,
      fromDepartment: DEPARTMENTS.FRONT_DESK,
      toDepartment: DEPARTMENTS.DENTIST,
      previousStatus,
      newStatus: patient.status,
      reason,
    });

    await recordAudit({ userId: req.user.id, action: 'PATIENT_SENT_TO_DENTIST', recordType: 'Patient', recordId: patient.id, details: { dentistId } });
    await notify({ userId: dentist.userId, title: 'New Patient Assigned', message: `${patient.name} has been sent to your queue.`, channel: 'IN_APP' });

    // Immediately move to "waiting for dentist" once queued
    patient.status = PATIENT_STATUS.WAITING_DENTIST;
    await patient.save();

    res.status(201).json({ patient, transfer });
  }
);

// --- Dentist accepts patient from their queue ---
router.post(
  '/accept',
  authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN),
  async (req, res) => {
    const schema = z.object({ patientId: z.string().uuid() });
    const { patientId } = schema.parse(req.body);

    const patient = await Patient.findByPk(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const previousStatus = patient.status;
    patient.status = PATIENT_STATUS.WITH_DENTIST;
    await patient.save();

    await createTransfer({
      patientId: patient.id,
      senderId: req.user.id,
      receiverId: req.user.id,
      fromDepartment: DEPARTMENTS.DENTIST,
      toDepartment: DEPARTMENTS.DENTIST,
      previousStatus,
      newStatus: patient.status,
      reason: 'Dentist accepted patient',
    });

    await recordAudit({ userId: req.user.id, action: 'PATIENT_ACCEPTED_BY_DENTIST', recordType: 'Patient', recordId: patient.id });

    res.json({ patient });
  }
);

// --- Dentist -> next department (Cashier and/or Pharmacy) ---
const nextDeptSchema = z.object({
  patientId: z.string().uuid(),
  toDepartment: z.enum([DEPARTMENTS.CASHIER, DEPARTMENTS.PHARMACY]),
  reason: z.string().optional(),
});

router.post(
  '/send-to-next',
  authorize(ROLES.DENTIST, ROLES.SUPER_ADMIN, ROLES.FRONT_DESK),
  async (req, res) => {
    const { patientId, toDepartment, reason } = nextDeptSchema.parse(req.body);

    const patient = await Patient.findByPk(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const previousStatus = patient.status;
    let fromDepartment = DEPARTMENTS.DENTIST;
    let newStatus;

    if (toDepartment === DEPARTMENTS.CASHIER) {
      newStatus = PATIENT_STATUS.SENT_TO_CASHIER;
    } else {
      newStatus = PATIENT_STATUS.SENT_TO_PHARMACY;
      if (previousStatus === PATIENT_STATUS.PAYMENT_COMPLETED) fromDepartment = DEPARTMENTS.CASHIER;
    }

    patient.status = newStatus;
    await patient.save();

    const transfer = await createTransfer({
      patientId: patient.id,
      senderId: req.user.id,
      fromDepartment,
      toDepartment,
      previousStatus,
      newStatus,
      reason,
    });

    // Move into the department's waiting state right away
    if (toDepartment === DEPARTMENTS.CASHIER) {
      patient.status = PATIENT_STATUS.PAYMENT_PENDING;
    } else {
      patient.status = PATIENT_STATUS.WAITING_PHARMACY;
    }
    await patient.save();

    await recordAudit({ userId: req.user.id, action: 'PATIENT_TRANSFERRED', recordType: 'Patient', recordId: patient.id, details: { toDepartment } });

    res.status(201).json({ patient, transfer });
  }
);

// --- Mark the entire visit complete ---
router.post(
  '/complete-visit',
  authorize(ROLES.FRONT_DESK, ROLES.DENTIST, ROLES.SUPER_ADMIN),
  async (req, res) => {
    const schema = z.object({ patientId: z.string().uuid() });
    const { patientId } = schema.parse(req.body);

    const patient = await Patient.findByPk(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const previousStatus = patient.status;
    patient.status = PATIENT_STATUS.VISIT_COMPLETED;
    await patient.save();

    await createTransfer({
      patientId: patient.id,
      senderId: req.user.id,
      toDepartment: DEPARTMENTS.COMPLETED,
      previousStatus,
      newStatus: patient.status,
      reason: 'Visit completed',
    });

    await recordAudit({ userId: req.user.id, action: 'VISIT_COMPLETED', recordType: 'Patient', recordId: patient.id });

    res.json({ patient });
  }
);

// --- Full transfer history for a patient ---
router.get('/history/:patientId', async (req, res) => {
  const transfers = await PatientTransfer.findAll({
    where: { patientId: req.params.patientId },
    include: [
      { model: User, as: 'sender', attributes: ['id', 'name', 'role'] },
      { model: User, as: 'receiver', attributes: ['id', 'name', 'role'] },
    ],
    order: [['transferTime', 'ASC']],
  });
  res.json(transfers);
});

module.exports = router;
