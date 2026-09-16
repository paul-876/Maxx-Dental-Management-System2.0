// Front Desk (reception, cashier, and pharmacy work) is one shared login/role
// that can move between all three areas from a hub screen in the UI, rather
// than three separate accounts each locked to their own section.
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FRONT_DESK: 'FRONT_DESK',
  DENTIST: 'DENTIST',
};

const PATIENT_STATUS = {
  REGISTERED: 'Registered',
  WAITING_FRONT_DESK: 'Waiting at Front Desk',
  SENT_TO_DENTIST: 'Sent to Dentist',
  WAITING_DENTIST: 'Waiting for Dentist',
  WITH_DENTIST: 'With Dentist',
  TREATMENT_COMPLETED: 'Treatment Completed',
  SENT_TO_CASHIER: 'Sent to Cashier',
  PAYMENT_PENDING: 'Payment Pending',
  PAYMENT_COMPLETED: 'Payment Completed',
  SENT_TO_PHARMACY: 'Sent to Pharmacy',
  WAITING_PHARMACY: 'Waiting at Pharmacy',
  MEDICINE_DISPENSED: 'Medicine Dispensed',
  VISIT_COMPLETED: 'Visit Completed',
};

const DEPARTMENTS = {
  FRONT_DESK: 'FRONT_DESK',
  DENTIST: 'DENTIST',
  CASHIER: 'CASHIER',
  PHARMACY: 'PHARMACY',
  COMPLETED: 'COMPLETED',
};

const APPOINTMENT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  MISSED: 'MISSED',
};

const PAYMENT_METHODS = {
  CASH: 'CASH',
  MPESA: 'MPESA',
  OTHER: 'OTHER',
};

module.exports = {
  ROLES,
  PATIENT_STATUS,
  DEPARTMENTS,
  APPOINTMENT_STATUS,
  PAYMENT_METHODS,
};
