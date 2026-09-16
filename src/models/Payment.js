const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { PAYMENT_METHODS } = require('../utils/constants');

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  patientId: { type: DataTypes.UUID, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  paymentMethod: {
    type: DataTypes.ENUM(...Object.values(PAYMENT_METHODS)),
    allowNull: false,
  },
  transactionReference: { type: DataTypes.STRING, allowNull: true },
  paymentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  cashierId: { type: DataTypes.UUID, allowNull: false },
  serviceDescription: { type: DataTypes.STRING, allowNull: true },
  balance: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  // Optional link to a formal Invoice this payment was applied against.
  // Null for the quick single-payment flow the Cashier queue uses directly.
  invoiceId: { type: DataTypes.UUID, allowNull: true },
});

module.exports = Payment;
