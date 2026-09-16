const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { DEPARTMENTS } = require('../utils/constants');

const PatientTransfer = sequelize.define('PatientTransfer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  senderId: { type: DataTypes.UUID, allowNull: true },
  receiverId: { type: DataTypes.UUID, allowNull: true },
  fromDepartment: { type: DataTypes.ENUM(...Object.values(DEPARTMENTS)), allowNull: true },
  toDepartment: { type: DataTypes.ENUM(...Object.values(DEPARTMENTS)), allowNull: false },
  previousStatus: { type: DataTypes.STRING, allowNull: true },
  newStatus: { type: DataTypes.STRING, allowNull: true },
  transferTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  reason: { type: DataTypes.STRING, allowNull: true },
  ticketNumber: { type: DataTypes.STRING, allowNull: true },
});

module.exports = PatientTransfer;
