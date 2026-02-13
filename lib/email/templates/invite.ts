interface InviteEmailOptions {
  orgName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}

export function inviteEmail(opts: InviteEmailOptions): { subject: string; html: string } {
  const { orgName, inviterName, role, acceptUrl } = opts;

  return {
    subject: `You've been invited to join ${orgName} on Synapse`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #18181b; padding: 24px 32px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Synapse</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #18181b; font-size: 16px; line-height: 1.5;">
                Hi there,
              </p>
              <p style="margin: 0 0 24px; color: #3f3f46; font-size: 15px; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> as a <strong>${role}</strong> on Synapse.
              </p>
              <!-- Invitation Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px; color: #71717a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Organization</p>
                    <p style="margin: 0 0 12px; color: #18181b; font-size: 18px; font-weight: 600;">${orgName}</p>
                    <p style="margin: 0 0 4px; color: #71717a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Your Role</p>
                    <p style="margin: 0; color: #18181b; font-size: 16px; font-weight: 500;">${role.charAt(0).toUpperCase() + role.slice(1)}</p>
                  </td>
                </tr>
              </table>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${acceptUrl}" style="display: inline-block; background-color: #18181b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 500;">
                  Accept Invitation →
                </a>
              </div>
              <p style="margin: 0; color: #a1a1aa; font-size: 13px; line-height: 1.5;">
                This invitation will expire in 7 days. If you didn't expect this email, you can safely ignore it.
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
