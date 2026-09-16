const { AuditLog } = require('../models');

/**
 * Record an audit trail entry. Never throws — audit logging must not
 * break the primary request if it fails.
 */
async function recordAudit({ userId, action, recordType, recordId, details }) {
  try {
    await AuditLog.create({
      userId: userId || null,
      action,
      recordType: recordType || null,
      recordId: recordId || null,
      details: details || null,
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { recordAudit };
