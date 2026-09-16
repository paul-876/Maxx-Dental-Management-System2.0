const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Medicine = sequelize.define('Medicine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
  lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
});

module.exports = Medicine;
