const express = require('express');
const { Dentist, User, Appointment } = require('../models');
const { authenticate } = require('../middleware/auth');
const { Op } = require('sequelize');

const router = express.Router();
router.use(authenticate);

// Any authenticated staff member can view the list of dentists
// (needed by receptionists to assign patients, cashiers to display info, etc.)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;

  const dentists = await Dentist.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: { exclude: ['password'] } }],
    order: [['createdAt', 'ASC']],
  });
  res.json(dentists);
});

router.get('/:id/schedule', async (req, res) => {
  const { date } = req.query;
  const where = { dentistId: req.params.id };
  if (date) where.appointmentDate = date;
  else {
    // default: today and future
    where.appointmentDate = { [Op.gte]: new Date().toISOString().slice(0, 10) };
  }
  const appointments = await Appointment.findAll({
    where,
    order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
  });
  res.json(appointments);
});

module.exports = router;
