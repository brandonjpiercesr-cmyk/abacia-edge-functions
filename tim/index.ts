/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Temporary Interim Model (TIM)
 * ═══════════════════════════════════════════════════════════════
 * ⬡B:supabase.tim:FUNCTION:tim.quick⬡
 * ABCD: ABACIA | v1.0.0-P1-S9.1
 * 
 * Full Name: Temporary Interim Model | Acronym: TIM | Agent #49
 * Department: CORE (Always summoned) | Reports To: AIR
 * Type: CORE_AGENT | Autonomous: YES | Commandable: YES
 * ACL: ⬡B:supabase.tim:FUNCTION:tim.quick⬡
 * 
 * TIM handles quick tasks, sub-second responses, no follow-up questions.
 * HARDCODED to always be summoned alongside Query Breaker.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainSearch } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

serve(async (req) => {
  const start = Date.now();
  try {
    const body = await req.json();
    const query = body.query || '';
    createTrace('AIR', 'TIM', 'AIR', `Quick: ${query.substring(0, 30)}`, 'PROCESSING');
    
    // Quick lookups
    const lower = query.toLowerCase();
    let answer = null;
    if (/what time|current time/i.test(lower)) answer = new Date().toLocaleTimeString('en-US');
    if (/what date|today/i.test(lower)) answer = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    if (answer) {
      return new Response(JSON.stringify({
        agent: 'Temporary Interim Model (TIM)', status: 'complete', answer, latencyMs: Date.now() - start
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // Quick brain search
    const client = createBrainClient();
    const results = await brainSearch(client, query, 3);
    
    return new Response(JSON.stringify({
      agent: 'Temporary Interim Model (TIM)', status: 'complete',
      found: results.length, answer: results[0]?.content?.substring(0, 200) || 'No quick answer',
      latencyMs: Date.now() - start
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Temporary Interim Model (TIM)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
