const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Prescription = sequelize.define('Prescription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  dentistId: { type: DataTypes.UUID, allowNull: false },
  prescriptionDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  instructions: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('PENDING', 'DISPENSED', 'PARTIALLY_DISPENSED'),
    defaultValue: 'PENDING',
  },
});

module.exports = Prescription;
