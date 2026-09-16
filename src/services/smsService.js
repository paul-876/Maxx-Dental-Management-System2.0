/**
 * SMS provider abstraction.
 *
 * SMS_PROVIDER=stub (default): logs the message instead of sending it, so
 * the whole system works end-to-end with zero external accounts.
 *
 * SMS_PROVIDER=africastalking: sends via Africa's Talking once
 * AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY are set in .env and the
 * `africastalking` npm package is installed (`npm install africastalking`).
 */

async function sendSms(to, message) {
  const provider = process.env.SMS_PROVIDER || 'stub';

  if (provider === 'stub') {
    console.log(`[SMS STUB] To: ${to} | Message: ${message}`);
    return { provider: 'stub', status: 'SENT', to, message };
  }

  if (provider === 'africastalking') {
    try {
      // Lazy require so the app still boots when the package isn't installed.
      // eslint-disable-next-line global-require
      const AfricasTalking = require('africastalking');
      const client = AfricasTalking({
        username: process.env.AFRICASTALKING_USERNAME,
        apiKey: process.env.AFRICASTALKING_API_KEY,
      });
      const sms = client.SMS;
      const result = await sms.send({
        to: [to],
        message,
        from: process.env.AFRICASTALKING_SENDER_ID || undefined,
      });
      return { provider: 'africastalking', status: 'SENT', result };
    } catch (err) {
      console.error('Africa\'s Talking SMS send failed, falling back to stub log:', err.message);
      console.log(`[SMS STUB FALLBACK] To: ${to} | Message: ${message}`);
      return { provider: 'africastalking', status: 'FAILED', error: err.message };
    }
  }

  console.warn(`Unknown SMS_PROVIDER "${provider}", falling back to stub.`);
  console.log(`[SMS STUB] To: ${to} | Message: ${message}`);
  return { provider: 'stub', status: 'SENT', to, message };
}

module.exports = { sendSms };
