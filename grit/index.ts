/**
 * AGENT: Genuine Resolution through Intelligent Tenacity (GRIT)
 * ⬡B:supabase.grit:FUNCTION:grit.resilience⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: RESILIENCE | Reports To: AIR
 * Type: RESILIENCE_AGENT | Autonomous: NO | Commandable: YES
 * GRIT tries 8 alternatives before passing any task back to human. Never gives up.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainSearch, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

serve(async (req) => {
  try {
    const body = await req.json();
    const { task, attempts = [], maxAttempts = 8 } = body;
    createTrace('AIR', 'GRIT', 'AIR', `Attempt ${attempts.length + 1}/${maxAttempts}: ${task?.substring(0, 30)}`, 'TRYING');
    
    if (attempts.length >= maxAttempts) {
      return new Response(JSON.stringify({
        agent: 'Genuine Resolution through Intelligent Tenacity (GRIT)', status: 'exhausted',
        message: 'Tried 8 alternatives. Escalating to human.',
        attempts: attempts.length
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    const client = createBrainClient();
    
    // Search for similar problems and solutions
    const solutions = await brainSearch(client, `${task} solution fix resolve`, 5);
    
    // Generate alternatives
    const alternatives = [
      'Try a different approach',
      'Break the task into smaller steps',
      'Search for documentation',
      'Check for similar past solutions',
      'Simplify the requirements',
      'Ask clarifying questions',
      'Use a template or example',
      'Escalate with specific blockers'
    ];
    
    const nextAlternative = alternatives[attempts.length] || 'Try again with new context';
    
    await brainWrite(client, {
      content: `GRIT ATTEMPT ${attempts.length + 1}: Task: ${task?.substring(0, 100)}. Next: ${nextAlternative}`,
      memory_type: 'system', categories: ['grit', 'resilience'], importance: 5,
      is_system: true, source: `grit_${Date.now()}`, tags: ['grit', 'attempt']
    });
    
    const result = {
      agent: 'Genuine Resolution through Intelligent Tenacity (GRIT)', status: 'trying',
      attemptNumber: attempts.length + 1, maxAttempts,
      nextAlternative, solutionsFound: solutions.length,
      message: 'GRIT never gives up. Trying alternative approach.'
    };
    
    await reportToAIR('GRIT', 'complete', result);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Genuine Resolution through Intelligent Tenacity (GRIT)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
