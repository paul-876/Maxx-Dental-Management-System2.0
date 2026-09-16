const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId: { type: DataTypes.UUID, allowNull: false },
  receiverId: { type: DataTypes.UUID, allowNull: true }, // null for group/department messages
  groupName: { type: DataTypes.STRING, allowNull: true }, // e.g. department chat name
  message: { type: DataTypes.TEXT, allowNull: false },
  readStatus: { type: DataTypes.BOOLEAN, defaultValue: false },
});

module.exports = Message;
