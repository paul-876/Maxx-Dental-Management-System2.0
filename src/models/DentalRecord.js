const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Covers examination + diagnosis (doc sections 24-25)
const DentalRecord = sequelize.define('DentalRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  dentistId: { type: DataTypes.UUID, allowNull: false },
  complaint: { type: DataTypes.TEXT, allowNull: true },
  examinationFindings: { type: DataTypes.TEXT, allowNull: true },
  dentalCondition: { type: DataTypes.STRING, allowNull: true },
  observations: { type: DataTypes.TEXT, allowNull: true },
  diagnosis: { type: DataTypes.TEXT, allowNull: true },
  diagnosisNotes: { type: DataTypes.TEXT, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  recordDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = DentalRecord;
