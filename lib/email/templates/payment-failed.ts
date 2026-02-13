interface PaymentFailedOptions {
  orgName: string;
  amount: string;
  nextRetryDate: string;
  updatePaymentUrl: string;
}

export function paymentFailedEmail(opts: PaymentFailedOptions): { subject: string; html: string } {
  const { orgName, amount, nextRetryDate, updatePaymentUrl } = opts;

  return {
    subject: `Payment failed for ${orgName}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Failed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #dc2626; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Payment Failed</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #18181b; font-size: 16px; line-height: 1.5;">
                Hi there,
              </p>
              <p style="margin: 0 0 24px; color: #3f3f46; font-size: 15px; line-height: 1.6;">
                We were unable to process the payment for <strong>${orgName}</strong>. Please update your payment method to avoid any interruption to your service.
              </p>
              <!-- Payment Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin: 0 0 4px; color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Amount Due</p>
                          <p style="margin: 0 0 16px; color: #18181b; font-size: 24px; font-weight: 700;">${amount}</p>
                          <p style="margin: 0 0 4px; color: #991b1b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Next Retry</p>
                          <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 500;">${nextRetryDate}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px; color: #3f3f46; font-size: 15px; line-height: 1.6;">
                If your payment method is not updated before the next retry, your account may be downgraded and on-demand usage will be paused.
              </p>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${updatePaymentUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 500;">
                  Update Payment Method →
                </a>
              </div>
              <p style="margin: 0; color: #a1a1aa; font-size: 13px; line-height: 1.5;">
                If you believe this is an error, please contact support at <a href="mailto:support@synapse.shop" style="color: #71717a;">support@synapse.shop</a>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 13px;">
                Sent by Synapse · <a href="https://synapse.shop" style="color: #a1a1aa;">synapse.shop</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  };
}
