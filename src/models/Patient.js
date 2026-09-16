const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { PATIENT_STATUS } = require('../utils/constants');

const Patient = sequelize.define('Patient', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  phoneNumber: { type: DataTypes.STRING, allowNull: false, unique: true }, // normalized +254...
  name: { type: DataTypes.STRING, allowNull: false },
  gender: { type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'), allowNull: true },
  dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: true },
  address: { type: DataTypes.STRING, allowNull: true },
  emergencyContact: { type: DataTypes.STRING, allowNull: true },
  medicalHistory: { type: DataTypes.TEXT, allowNull: true },
  dentalHistory: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM(...Object.values(PATIENT_STATUS)),
    defaultValue: PATIENT_STATUS.REGISTERED,
  },
  registeredById: { type: DataTypes.UUID, allowNull: true },
});

module.exports = Patient;
