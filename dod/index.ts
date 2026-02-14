/**
 * AGENT: Drill or Die (DOD)
 * ⬡B:supabase.dod:FUNCTION:dod.drill⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: JOBS | Reports To: HUNTER (Jobs Lead) → AIR
 * Type: INTERVIEW_AGENT | Autonomous: YES (triggered by interview detection) | Commandable: YES
 * DOD handles interview prep. Scans emails for interview invites, generates mock questions, STAR coaching.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainSearch, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

const STAR_TEMPLATE = `STAR Method:
S - Situation: Describe the context
T - Task: What was required?
A - Action: What did YOU do?
R - Result: What was the outcome?`;

serve(async (req) => {
  try {
    const body = await req.json();
    const { company, role, action } = body;
    createTrace('AIR', 'DOD', 'AIR', `Drill: ${company || 'interview'} ${role || 'prep'}`, 'DRILLING');
    
    const client = createBrainClient();
    
    // Search for company/role info
    const context = await brainSearch(client, `${company} ${role} interview`, 5);
    
    // Generate mock questions
    const questions = [
      `Tell me about yourself and why you're interested in ${company || 'this role'}`,
      `Describe a challenging project you led. What was the outcome?`,
      `How do you handle tight deadlines and competing priorities?`,
      `Where do you see yourself in 5 years?`,
      `Why should we hire you for ${role || 'this position'}?`
    ];
    
    // Store drill session
    await brainWrite(client, {
      content: `DOD DRILL [${new Date().toISOString()}]: ${company || 'Company'} - ${role || 'Role'}. Questions: ${questions.length}`,
      memory_type: 'system', categories: ['dod', 'interview', 'drill'], importance: 7,
      is_system: true, source: `dod_${Date.now()}`, tags: ['dod', 'interview', 'prep']
    });
    
    const result = {
      agent: 'Drill or Die (DOD)', status: 'complete',
      company, role, questionCount: questions.length,
      questions, starTemplate: STAR_TEMPLATE,
      contextFound: context.length
    };
    
    await reportToAIR('DOD', 'complete', result);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Drill or Die (DOD)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
