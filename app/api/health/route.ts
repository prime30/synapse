import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const checks: Record<string, string> = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };

  try {
    // Check database
    const supabase = await createClient();
    const { error: dbError } = await supabase.from('profiles').select('id').limit(1);
    checks.database = dbError ? 'unhealthy' : 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  // Check AI provider keys
  checks.openai = process.env.OPENAI_API_KEY ? 'configured' : 'not_configured';
  checks.anthropic = process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured';

  const isHealthy = checks.database === 'healthy';

  return NextResponse.json(
    { data: checks },
    { status: isHealthy ? 200 : 503 }
  );
}
