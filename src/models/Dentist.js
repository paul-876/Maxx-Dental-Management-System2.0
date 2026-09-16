const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Dentist = sequelize.define('Dentist', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, unique: true },
  specialization: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
});

module.exports = Dentist;
