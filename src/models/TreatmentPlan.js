const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TreatmentPlan = sequelize.define('TreatmentPlan', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  dentistId: { type: DataTypes.UUID, allowNull: false },
  treatmentName: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  estimatedCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  status: {
    type: DataTypes.ENUM('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
    defaultValue: 'PLANNED',
  },
  requiredAppointments: { type: DataTypes.INTEGER, allowNull: true },
  followUpInfo: { type: DataTypes.TEXT, allowNull: true },
});

module.exports = TreatmentPlan;
