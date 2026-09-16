const sequelize = require('../config/database');

const User = require('./User');
const Dentist = require('./Dentist');
const Patient = require('./Patient');
const Appointment = require('./Appointment');
const DentalRecord = require('./DentalRecord');
const TreatmentPlan = require('./TreatmentPlan');
const TreatmentRecord = require('./TreatmentRecord');
const Medicine = require('./Medicine');
const Prescription = require('./Prescription');
const PrescriptionItem = require('./PrescriptionItem');
const Payment = require('./Payment');
const Receipt = require('./Receipt');
const Invoice = require('./Invoice');
const InvoiceItem = require('./InvoiceItem');
const PatientTransfer = require('./PatientTransfer');
const Message = require('./Message');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');

// --- Associations ---

User.hasOne(Dentist, { foreignKey: 'userId', as: 'dentistProfile' });
Dentist.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Patient.hasMany(Appointment, { foreignKey: 'patientId', as: 'appointments' });
Appointment.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
Dentist.hasMany(Appointment, { foreignKey: 'dentistId', as: 'appointments' });
Appointment.belongsTo(Dentist, { foreignKey: 'dentistId', as: 'dentist' });

Patient.hasMany(DentalRecord, { foreignKey: 'patientId', as: 'dentalRecords' });
DentalRecord.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
Dentist.hasMany(DentalRecord, { foreignKey: 'dentistId', as: 'dentalRecords' });
DentalRecord.belongsTo(Dentist, { foreignKey: 'dentistId', as: 'dentist' });

Patient.hasMany(TreatmentPlan, { foreignKey: 'patientId', as: 'treatmentPlans' });
TreatmentPlan.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
Dentist.hasMany(TreatmentPlan, { foreignKey: 'dentistId', as: 'treatmentPlans' });
TreatmentPlan.belongsTo(Dentist, { foreignKey: 'dentistId', as: 'dentist' });

Patient.hasMany(TreatmentRecord, { foreignKey: 'patientId', as: 'treatmentRecords' });
TreatmentRecord.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
Dentist.hasMany(TreatmentRecord, { foreignKey: 'dentistId', as: 'treatmentRecords' });
TreatmentRecord.belongsTo(Dentist, { foreignKey: 'dentistId', as: 'dentist' });
TreatmentPlan.hasMany(TreatmentRecord, { foreignKey: 'treatmentPlanId', as: 'treatmentRecords' });
TreatmentRecord.belongsTo(TreatmentPlan, { foreignKey: 'treatmentPlanId', as: 'treatmentPlan' });

Patient.hasMany(Prescription, { foreignKey: 'patientId', as: 'prescriptions' });
Prescription.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
Dentist.hasMany(Prescription, { foreignKey: 'dentistId', as: 'prescriptions' });
Prescription.belongsTo(Dentist, { foreignKey: 'dentistId', as: 'dentist' });

Prescription.hasMany(PrescriptionItem, { foreignKey: 'prescriptionId', as: 'items' });
PrescriptionItem.belongsTo(Prescription, { foreignKey: 'prescriptionId', as: 'prescription' });
Medicine.hasMany(PrescriptionItem, { foreignKey: 'medicineId', as: 'prescriptionItems' });
PrescriptionItem.belongsTo(Medicine, { foreignKey: 'medicineId', as: 'medicine' });

Patient.hasMany(Payment, { foreignKey: 'patientId', as: 'payments' });
Payment.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
User.hasMany(Payment, { foreignKey: 'cashierId', as: 'paymentsHandled' });
Payment.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });

Payment.hasOne(Receipt, { foreignKey: 'paymentId', as: 'receipt' });
Receipt.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' });

Patient.hasMany(Invoice, { foreignKey: 'patientId', as: 'invoices' });
Invoice.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
User.hasMany(Invoice, { foreignKey: 'createdById', as: 'invoicesCreated' });
Invoice.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });

Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });

Patient.hasMany(PatientTransfer, { foreignKey: 'patientId', as: 'transfers' });
PatientTransfer.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });
User.hasMany(PatientTransfer, { foreignKey: 'senderId', as: 'sentTransfers' });
PatientTransfer.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
User.hasMany(PatientTransfer, { foreignKey: 'receiverId', as: 'receivedTransfers' });
PatientTransfer.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
User.hasMany(Message, { foreignKey: 'receiverId', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Patient.hasMany(Notification, { foreignKey: 'patientId', as: 'notifications' });
Notification.belongsTo(Patient, { foreignKey: 'patientId', as: 'patient' });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  User,
  Dentist,
  Patient,
  Appointment,
  DentalRecord,
  TreatmentPlan,
  TreatmentRecord,
  Medicine,
  Prescription,
  PrescriptionItem,
  Payment,
  Receipt,
  Invoice,
  InvoiceItem,
  PatientTransfer,
  Message,
  Notification,
  AuditLog,
};
