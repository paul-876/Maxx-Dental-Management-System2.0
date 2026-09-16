/**
 * M-Pesa (Safaricom Daraja) payment abstraction.
 *
 * MPESA_PROVIDER=stub (default): simulates an STK push and immediately
 * "confirms" the payment so the cashier flow works end-to-end without a
 * Daraja account. Swap in real Daraja API calls once
 * MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_SHORTCODE /
 * MPESA_PASSKEY / MPESA_CALLBACK_URL are set.
 */

async function initiateStkPush({ phoneNumber, amount, accountReference }) {
  const provider = process.env.MPESA_PROVIDER || 'stub';

  if (provider === 'stub') {
    const fakeCheckoutId = `STUB-${Date.now()}`;
    console.log(
      `[MPESA STUB] STK push simulated for ${phoneNumber}, amount ${amount}, ref ${accountReference}. CheckoutRequestID=${fakeCheckoutId}`
    );
    return {
      provider: 'stub',
      status: 'SUCCESS',
      checkoutRequestId: fakeCheckoutId,
      transactionReference: fakeCheckoutId,
    };
  }

  // Real Daraja integration would go here: OAuth token -> STK push request ->
  // handle callback at MPESA_CALLBACK_URL to confirm payment.
  throw Object.assign(new Error('Live M-Pesa integration is not configured yet.'), { status: 501 });
}

module.exports = { initiateStkPush };
