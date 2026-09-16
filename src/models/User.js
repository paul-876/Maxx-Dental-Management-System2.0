const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { ROLES } = require('../utils/constants');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: true, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM(...Object.values(ROLES)), allowNull: false },
  professionalInfo: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), defaultValue: 'ACTIVE' },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
});

module.exports = User;
