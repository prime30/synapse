import { createServiceClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { spendingAlertEmail } from '@/lib/email/templates/spending-alert';

/**
 * Check spending thresholds after a usage record is inserted.
 * Called from usage-recorder after each recordUsage() call.
 *
 * MUST be fire-and-forget — never let this break a request.
 */
export async function checkSpendingThresholds(organizationId: string): Promise<void> {
  try {
    const supabase = createServiceClient();

    // 1. Get the org's spending alert config
    const { data: alert } = await supabase
      .from('spending_alerts')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!alert || !alert.email_enabled || !alert.monthly_limit_cents) return;

    // 2. Get current period spending from daily_usage_rollups
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).toISOString();
    const { data: rollups } = await supabase
      .from('daily_usage_rollups')
      .select('total_cost_cents')
      .eq('organization_id', organizationId)
      .gte('day', startOfMonth.split('T')[0]);

    const totalSpend = (rollups ?? []).reduce(
      (sum, r) => sum + r.total_cost_cents,
      0,
    );
    const percentage = Math.round(
      (totalSpend / alert.monthly_limit_cents) * 100,
    );

    // 3. Check if we need to alert
    if (percentage < alert.alert_threshold_pct) return;

    // 4. Check if already alerted this period
    if (alert.last_alerted_at) {
      const lastAlerted = new Date(alert.last_alerted_at);
      const periodStart = new Date(startOfMonth);
      if (lastAlerted >= periodStart) return; // Already alerted this period
    }

    // 5. Get org owner's email
    const { data: owner } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('role', 'owner')
      .single();

    if (!owner) return;

    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(owner.user_id);
    if (!user?.email) return;

    // 6. Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    // 7. Send alert email
    const template = spendingAlertEmail({
      orgName: org?.name ?? 'Your workspace',
      currentSpend: `$${(totalSpend / 100).toFixed(2)}`,
      limit: `$${(alert.monthly_limit_cents / 100).toFixed(2)}`,
      percentage,
    });

    await sendEmail({
      to: user.email,
      subject: template.subject,
      html: template.html,
    });

    // 8. Update last_alerted_at
    await supabase
      .from('spending_alerts')
      .update({ last_alerted_at: new Date().toISOString() })
      .eq('id', alert.id);
  } catch (error) {
    console.error('[SpendingMonitor] Error checking thresholds:', error);
    // Never throw — this is fire-and-forget
  }
}
