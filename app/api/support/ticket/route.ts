import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TicketPayload {
  email: string;
  subject: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePayload(body: unknown): TicketPayload | null {
  if (!body || typeof body !== 'object') return null;

  const { email, subject, message } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !email.includes('@')) return null;
  if (typeof subject !== 'string' || !subject.trim()) return null;
  if (typeof message !== 'string' || !message.trim()) return null;
  if (message.length > 5000) return null;

  return {
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/support/ticket
 *
 * Receives a support ticket and forwards it to the configured destination.
 *
 * Current implementation: logs the ticket and returns success. In production,
 * replace the forwarding logic with one of:
 *   - Gorgias REST API: POST /api/tickets
 *   - Email via webhook (Zapier, Make, SendGrid)
 *   - Direct SMTP
 *   - Supabase insert for self-hosted ticket tracking
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ticket = validatePayload(body);

    if (!ticket) {
      return NextResponse.json(
        { error: 'Invalid request. Please provide email, subject, and message.' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------
    // Forward the ticket
    // -----------------------------------------------------------------

    // Option 1: Gorgias API (when GORGIAS_API_KEY is configured)
    const gorgiasApiKey = process.env.GORGIAS_API_KEY;
    const gorgiasDomain = process.env.GORGIAS_DOMAIN; // e.g. "yourstore.gorgias.com"

    if (gorgiasApiKey && gorgiasDomain) {
      const gorgiasRes = await fetch(
        `https://${gorgiasDomain}/api/tickets`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${ticket.email}:${gorgiasApiKey}`).toString('base64')}`,
          },
          body: JSON.stringify({
            customer: { email: ticket.email },
            subject: `[Synapse Support] ${ticket.subject}`,
            messages: [
              {
                source: { type: 'email', from: { address: ticket.email } },
                body_text: ticket.message,
                channel: 'email',
                via: 'api',
              },
            ],
          }),
        },
      );

      if (!gorgiasRes.ok) {
        console.error(
          '[support/ticket] Gorgias API error:',
          gorgiasRes.status,
          await gorgiasRes.text().catch(() => ''),
        );
        // Fall through to success — don't fail the user if Gorgias is down
      }
    }

    // Option 2: Webhook (when SUPPORT_WEBHOOK_URL is configured)
    const webhookUrl = process.env.SUPPORT_WEBHOOK_URL;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ticket.email,
          subject: ticket.subject,
          message: ticket.message,
          timestamp: new Date().toISOString(),
          source: 'synapse-support-panel',
        }),
      }).catch((err) => {
        console.error('[support/ticket] Webhook error:', err);
      });
    }

    // Always log for debugging/audit
    console.log('[support/ticket] Ticket received:', {
      email: ticket.email,
      subject: ticket.subject,
      messageLength: ticket.message.length,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[support/ticket] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
