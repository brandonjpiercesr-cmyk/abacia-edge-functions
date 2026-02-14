/**
 * ⬡B:supabase.shared:UTILITY:air.client⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9
 * 
 * AIR (ABA Intellectual Role) client for agent-to-AIR communication
 * Every agent uses this to report back to AIR
 */

const ABACIA_URL = Deno.env.get('ABACIA_URL') || 'https://abacia-services.onrender.com';

export interface AIRTrace {
  passer: string;
  agent: string;
  receiver: string;
  action: string;
  result: string;
  timestamp: string;
}

export async function reportToAIR(
  agentId: string,
  status: string,
  data: any
): Promise<void> {
  try {
    await fetch(`${ABACIA_URL}/api/air/agent-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentId,
        status,
        data,
        timestamp: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error(`[${agentId}] Failed to report to AIR:`, err.message);
  }
}

export async function dispatchAgent(
  targetAgent: string,
  intent: any,
  request: any
): Promise<any> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/${targetAgent.toLowerCase()}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ intent, request })
  });
  
  return response.json();
}

export async function escalateToREACH(
  urgency: number,
  message: string,
  source: string
): Promise<void> {
  const REACH_URL = Deno.env.get('REACH_URL') || 'https://aba-reach.onrender.com';
  
  await fetch(`${REACH_URL}/api/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urgency, message, source })
  });
}

// We Are All ABA.
