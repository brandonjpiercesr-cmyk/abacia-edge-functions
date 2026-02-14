/**
 * AGENT: Hearing Engine for Ambient Recognition (HEAR)
 * ⬡B:supabase.hear:FUNCTION:hear.ears⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: EARS | Reports To: VARA (Voice Lead) → AIR
 * Type: AUDIO_AGENT | Autonomous: YES (OMI triggers) | Commandable: YES
 * HEAR receives audio from OMI/browser, transcribes via Deepgram, routes to LUKE.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR, dispatchAgent } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

const DEEPGRAM_API_KEY = Deno.env.get('DEEPGRAM_API_KEY');

serve(async (req) => {
  try {
    const body = await req.json();
    createTrace('OMI', 'HEAR', 'AIR', 'Receiving audio', 'TRANSCRIBING');
    
    const transcript = body.transcript || body.text || '';
    if (!transcript) {
      return new Response(JSON.stringify({
        agent: 'Hearing Engine for Ambient Recognition (HEAR)', status: 'skipped', reason: 'No transcript'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // Store in brain
    const client = createBrainClient();
    await brainWrite(client, {
      content: `HEAR TRANSCRIPT [${new Date().toISOString()}]: ${transcript.substring(0, 500)}`,
      memory_type: 'system', categories: ['hear', 'transcript'], importance: 5,
      is_system: true, source: `hear_${Date.now()}`, tags: ['hear', 'transcript', 'omi']
    });
    
    // Dispatch to LUKE for action extraction
    await dispatchAgent('LUKE', { content: transcript }, { source: 'hear' });
    
    const result = {
      agent: 'Hearing Engine for Ambient Recognition (HEAR)', status: 'complete',
      transcriptLength: transcript.length, dispatchedTo: 'LUKE'
    };
    await reportToAIR('HEAR', 'complete', result);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Hearing Engine for Ambient Recognition (HEAR)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
