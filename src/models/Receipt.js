const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Receipt = sequelize.define('Receipt', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  paymentId: { type: DataTypes.UUID, allowNull: false, unique: true },
  receiptNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = Receipt;
