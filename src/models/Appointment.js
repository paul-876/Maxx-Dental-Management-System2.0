const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { APPOINTMENT_STATUS } = require('../utils/constants');

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  dentistId: { type: DataTypes.UUID, allowNull: true },
  appointmentDate: { type: DataTypes.DATEONLY, allowNull: false },
  appointmentTime: { type: DataTypes.STRING, allowNull: false }, // HH:mm
  status: {
    type: DataTypes.ENUM(...Object.values(APPOINTMENT_STATUS)),
    defaultValue: APPOINTMENT_STATUS.SCHEDULED,
  },
  reason: { type: DataTypes.STRING, allowNull: true },
  createdById: { type: DataTypes.UUID, allowNull: true },
});

module.exports = Appointment;
