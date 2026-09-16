const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PrescriptionItem = sequelize.define('PrescriptionItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  prescriptionId: { type: DataTypes.UUID, allowNull: false },
  medicineId: { type: DataTypes.UUID, allowNull: false },
  dosage: { type: DataTypes.STRING, allowNull: true },
  frequency: { type: DataTypes.STRING, allowNull: true },
  duration: { type: DataTypes.STRING, allowNull: true },
  instructions: { type: DataTypes.STRING, allowNull: true },
  dispensed: { type: DataTypes.BOOLEAN, defaultValue: false },
  dispensedAt: { type: DataTypes.DATE, allowNull: true },
  dispensedById: { type: DataTypes.UUID, allowNull: true },
});

module.exports = PrescriptionItem;
