const { Op } = require('sequelize');

function todayPrefix() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Generate a daily-resetting ticket number like T-20260822-0007 */
async function generateTicketNumber(PatientTransfer) {
  const prefix = todayPrefix();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const countToday = await PatientTransfer.count({
    where: {
      ticketNumber: { [Op.not]: null },
      transferTime: { [Op.gte]: startOfDay },
    },
  });
  return `T-${prefix}-${String(countToday + 1).padStart(4, '0')}`;
}

/** Generate a daily-resetting receipt number like RCT-20260822-0007 */
async function generateReceiptNumber(Receipt) {
  const prefix = todayPrefix();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const countToday = await Receipt.count({
    where: { generatedAt: { [Op.gte]: startOfDay } },
  });
  return `RCT-${prefix}-${String(countToday + 1).padStart(4, '0')}`;
}

/** Generate a daily-resetting invoice number like INV-20260822-0007 */
async function generateInvoiceNumber(Invoice) {
  const prefix = todayPrefix();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const countToday = await Invoice.count({
    where: { createdAt: { [Op.gte]: startOfDay } },
  });
  return `INV-${prefix}-${String(countToday + 1).padStart(4, '0')}`;
}

module.exports = { generateTicketNumber, generateReceiptNumber, generateInvoiceNumber };
