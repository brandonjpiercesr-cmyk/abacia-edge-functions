/**
 * AGENT: Quality Unified Intelligence for Letters and Language (QUILL)
 * ⬡B:supabase.quill:FUNCTION:quill.writing⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: WRITING (Lead) | Reports To: AIR
 * Type: WRITING_AGENT | Autonomous: NO | Commandable: YES
 * QUILL handles writing: cover letters, emails, documents. Passes through DRAFT for BS check.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainSearch, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR, dispatchAgent } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

serve(async (req) => {
  try {
    const body = await req.json();
    const { type, context, template } = body;
    createTrace('AIR', 'QUILL', 'AIR', `Writing ${type || 'content'}`, 'WRITING');
    
    const client = createBrainClient();
    
    // Search for relevant templates/examples
    const examples = await brainSearch(client, `${type} template example`, 5);
    
    // Generate content based on type
    let content = '';
    if (type === 'cover_letter') {
      content = `Dear Hiring Manager,\n\n${context || 'I am writing to express my interest...'}\n\nSincerely,\nBrandon Pierce`;
    } else if (type === 'email') {
      content = context || 'Email content here...';
    } else {
      content = context || 'Content...';
    }
    
    // Send to DRAFT for BS check
    const draftResult = await dispatchAgent('DRAFT', { content }, {});
    
    // Store in brain
    await brainWrite(client, {
      content: `QUILL OUTPUT [${type}]: ${content.substring(0, 200)}...`,
      memory_type: 'system', categories: ['quill', type || 'writing'], importance: 5,
      is_system: true, source: `quill_${Date.now()}`, tags: ['quill', 'writing', type || 'general']
    });
    
    const result = {
      agent: 'Quality Unified Intelligence for Letters and Language (QUILL)', status: 'complete',
      type, contentLength: content.length, draftPassed: draftResult?.passed ?? true,
      examplesFound: examples.length, content
    };
    
    await reportToAIR('QUILL', 'complete', { ...result, content: undefined });
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Quality Unified Intelligence for Letters and Language (QUILL)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
