const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TreatmentRecord = sequelize.define('TreatmentRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  dentistId: { type: DataTypes.UUID, allowNull: false },
  treatmentPlanId: { type: DataTypes.UUID, allowNull: true },
  treatment: { type: DataTypes.STRING, allowNull: false },
  treatmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('COMPLETED', 'FOLLOW_UP_REQUIRED'),
    defaultValue: 'COMPLETED',
  },
});

module.exports = TreatmentRecord;
