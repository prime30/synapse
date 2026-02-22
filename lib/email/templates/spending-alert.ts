interface SpendingAlertOptions {
  orgName: string;
  currentSpend: string;
  limit: string;
  percentage: number;
}

export function spendingAlertEmail(opts: SpendingAlertOptions): { subject: string; html: string } {
  const { orgName, currentSpend, limit, percentage } = opts;

  return {
    subject: `Spending alert: ${percentage}% of your limit reached`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Spending Alert</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #f59e0b; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Spending Alert</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #18181b; font-size: 16px; line-height: 1.5;">
                Hi there,
              </p>
              <p style="margin: 0 0 24px; color: #3f3f46; font-size: 15px; line-height: 1.6;">
                Your organization <strong>${orgName}</strong> has reached <strong>${percentage}%</strong> of its monthly spending limit.
              </p>
              <!-- Stats -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #fefce8; border: 1px solid #fde68a; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom: 12px;">
                          <span style="color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Current Spend</span><br />
                          <span style="color: #18181b; font-size: 24px; font-weight: 700;">${currentSpend}</span>
                        </td>
                        <td style="padding-bottom: 12px; text-align: right;">
                          <span style="color: #92400e; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Monthly Limit</span><br />
                          <span style="color: #18181b; font-size: 24px; font-weight: 700;">${limit}</span>
                        </td>
                      </tr>
                    </table>
                    <!-- Progress bar -->
                    <div style="background-color: #fde68a; border-radius: 4px; height: 8px; overflow: hidden;">
                      <div style="background-color: ${percentage >= 90 ? '#dc2626' : '#f59e0b'}; height: 100%; width: ${Math.min(percentage, 100)}%; border-radius: 4px;"></div>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px; color: #3f3f46; font-size: 15px; line-height: 1.6;">
                You can adjust your spending limits or upgrade your plan in the billing settings.
              </p>
              <a href="https://synapse.shop/settings/billing" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500;">
                Manage Billing →
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 13px;">
                You're receiving this because spending alerts are enabled for ${orgName}. You can disable them in your billing settings.
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
