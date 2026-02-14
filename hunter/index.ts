/**
 * AGENT: Hunting Useful New Talent and Employment Resources (HUNTER)
 * ⬡B:supabase.hunter:FUNCTION:hunter.jobs⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: JOBS (Lead) | Reports To: AIR
 * Type: JOB_AGENT | Autonomous: YES (triggered by IMAN job alerts) | Commandable: YES
 * HUNTER scans job boards, parses Idealist URLs, tracks applications, manages pipeline.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite, brainSearch } from '../_shared/brain-client.ts'
import { reportToAIR, dispatchAgent } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

serve(async (req) => {
  try {
    const body = await req.json();
    const { action, jobUrl, query } = body;
    createTrace('AIR', 'HUNTER', 'AIR', `${action || 'search'}: ${query || jobUrl || 'jobs'}`, 'HUNTING');
    
    const client = createBrainClient();
    
    if (action === 'parse_url' && jobUrl) {
      // Parse job URL (Idealist, LinkedIn, etc.)
      const jobData = {
        url: jobUrl, parsedAt: new Date().toISOString(),
        source: jobUrl.includes('idealist') ? 'idealist' : jobUrl.includes('linkedin') ? 'linkedin' : 'other'
      };
      
      await brainWrite(client, {
        content: `JOB FOUND: ${jobUrl} (${jobData.source})`,
        memory_type: 'system', categories: ['hunter', 'job', jobData.source], importance: 7,
        is_system: true, source: `hunter_${Date.now()}`, tags: ['job', 'hunter', 'action_needed', jobData.source]
      });
      
      // Dispatch to QUILL for cover letter
      await dispatchAgent('QUILL', { type: 'cover_letter', context: `Job: ${jobUrl}` }, {});
      
      return new Response(JSON.stringify({
        agent: 'Hunting Useful New Talent and Employment Resources (HUNTER)', status: 'complete',
        action: 'parse_url', job: jobData, dispatchedTo: 'QUILL'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // Search existing jobs in brain
    const jobs = await brainSearch(client, query || 'job application', 10);
    
    const result = {
      agent: 'Hunting Useful New Talent and Employment Resources (HUNTER)', status: 'complete',
      action: 'search', found: jobs.length,
      jobs: jobs.map(j => ({ preview: j.content?.substring(0, 100), tags: j.tags }))
    };
    
    await reportToAIR('HUNTER', 'complete', result);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Hunting Useful New Talent and Employment Resources (HUNTER)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
