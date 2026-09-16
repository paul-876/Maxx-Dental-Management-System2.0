const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING, allowNull: false },
  recordType: { type: DataTypes.STRING, allowNull: true },
  recordId: { type: DataTypes.UUID, allowNull: true },
  details: { type: DataTypes.JSONB, allowNull: true },
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = AuditLog;
