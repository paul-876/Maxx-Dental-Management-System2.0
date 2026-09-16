/**
 * Email provider abstraction.
 *
 * EMAIL_PROVIDER=stub (default): logs the email instead of sending it.
 * EMAIL_PROVIDER=smtp: sends via SMTP once SMTP_* vars are set in .env and
 * `nodemailer` is installed (`npm install nodemailer`).
 */

async function sendEmail(to, subject, body) {
  const provider = process.env.EMAIL_PROVIDER || 'stub';

  if (!to) {
    return { provider, status: 'SKIPPED', reason: 'No email address on file.' };
  }

  if (provider === 'stub') {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject} | Body: ${body}`);
    return { provider: 'stub', status: 'SENT', to, subject };
  }

  if (provider === 'smtp') {
    try {
      // eslint-disable-next-line global-require
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        text: body,
      });
      return { provider: 'smtp', status: 'SENT', info };
    } catch (err) {
      console.error('SMTP email send failed, falling back to stub log:', err.message);
      console.log(`[EMAIL STUB FALLBACK] To: ${to} | Subject: ${subject} | Body: ${body}`);
      return { provider: 'smtp', status: 'FAILED', error: err.message };
    }
  }

  console.warn(`Unknown EMAIL_PROVIDER "${provider}", falling back to stub.`);
  console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject} | Body: ${body}`);
  return { provider: 'stub', status: 'SENT', to, subject };
}

module.exports = { sendEmail };
