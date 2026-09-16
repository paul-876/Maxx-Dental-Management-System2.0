const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InvoiceItem = sequelize.define('InvoiceItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  invoiceId: { type: DataTypes.UUID, allowNull: false },
  description: { type: DataTypes.STRING, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
  unitPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
});

module.exports = InvoiceItem;
