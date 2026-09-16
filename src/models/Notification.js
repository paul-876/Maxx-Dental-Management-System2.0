const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: true }, // staff recipient
  patientId: { type: DataTypes.UUID, allowNull: true }, // patient recipient
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  channel: {
    type: DataTypes.ENUM('IN_APP', 'SMS', 'EMAIL'),
    defaultValue: 'IN_APP',
  },
  status: {
    type: DataTypes.ENUM('SENT', 'READ', 'FAILED'),
    defaultValue: 'SENT',
  },
});

module.exports = Notification;
