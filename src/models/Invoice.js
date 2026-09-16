const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A formal, itemized bill for a patient — separate from (and additive to)
// the quick single-payment flow the Cashier queue already uses. Staff can
// build an invoice from one or more billable line items (a filling, a
// consultation, medicine, etc.), then apply one or more payments against it
// until the balance reaches zero.
const Invoice = sequelize.define('Invoice', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  invoiceNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  status: {
    type: DataTypes.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID'),
    defaultValue: 'UNPAID',
  },
  subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  tax: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  amountPaid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  balance: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdById: { type: DataTypes.UUID, allowNull: true },
  voidedAt: { type: DataTypes.DATE, allowNull: true },
});

module.exports = Invoice;
