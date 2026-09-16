require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const dentistRoutes = require('./routes/dentists');
const patientRoutes = require('./routes/patients');
const appointmentRoutes = require('./routes/appointments');
const workflowRoutes = require('./routes/workflow');
const dentalRecordRoutes = require('./routes/dentalRecords');
const medicineRoutes = require('./routes/medicines');
const prescriptionRoutes = require('./routes/prescriptions');
const paymentRoutes = require('./routes/payments');
const invoiceRoutes = require('./routes/invoices');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const auditLogRoutes = require('./routes/auditLogs');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'max-dental-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dentists', dentistRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/dental', dentalRecordRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit-logs', auditLogRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
