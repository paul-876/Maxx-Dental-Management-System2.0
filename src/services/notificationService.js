const { Notification, User, Patient } = require('../models');
const { sendSms } = require('./smsService');
const { sendEmail } = require('./emailService');

/**
 * Create an in-app notification and, if requested, dispatch it over
 * SMS/email too. Recipient is either a staff user (userId) or a patient
 * (patientId).
 */
async function notify({ userId, patientId, title, message, channel = 'IN_APP' }) {
  const notification = await Notification.create({
    userId: userId || null,
    patientId: patientId || null,
    title,
    message,
    channel,
  });

  if (channel === 'SMS') {
    let to = null;
    if (patientId) {
      const patient = await Patient.findByPk(patientId);
      to = patient?.phoneNumber;
    } else if (userId) {
      const user = await User.findByPk(userId);
      to = user?.phone;
    }
    if (to) await sendSms(to, message);
  }

  if (channel === 'EMAIL') {
    let to = null;
    if (patientId) {
      const patient = await Patient.findByPk(patientId);
      to = patient?.email;
    } else if (userId) {
      const user = await User.findByPk(userId);
      to = user?.email;
    }
    if (to) await sendEmail(to, title, message);
  }

  return notification;
}

module.exports = { notify };
