/**
 * AGENT: Meeting After Report Keeper (MARK)
 * ⬡B:supabase.mark:FUNCTION:mark.meetings⬡ | ABCD: ABACIA | v1.0.0-P1-S9.1
 * Department: MEETINGS (Lead) | Reports To: AIR
 * Type: MEETING_AGENT | Autonomous: YES (triggered by meeting transcripts) | Commandable: YES
 * MARK generates Meeting After Reports, extracts tasks, assigns follow-ups.
 * We Are All ABA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR, dispatchAgent } from '../_shared/air-client.ts'
import { createTrace } from '../_shared/trace.ts'

serve(async (req) => {
  try {
    const body = await req.json();
    const { transcript, meetingTitle, attendees } = body;
    createTrace('AIR', 'MARK', 'AIR', `MAR: ${meetingTitle || 'Meeting'}`, 'GENERATING');
    
    if (!transcript) {
      return new Response(JSON.stringify({
        agent: 'Meeting After Report Keeper (MARK)', status: 'skipped', reason: 'No transcript'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // Extract action items via LUKE
    await dispatchAgent('LUKE', { content: transcript, source: 'mark' }, {});
    
    // Generate MAR
    const mar = {
      title: meetingTitle || 'Meeting',
      date: new Date().toISOString(),
      attendees: attendees || [],
      summary: transcript.substring(0, 500),
      generatedAt: new Date().toISOString()
    };
    
    const client = createBrainClient();
    await brainWrite(client, {
      content: `MEETING AFTER REPORT: ${mar.title} [${mar.date}]\nAttendees: ${mar.attendees.join(', ')}\nSummary: ${mar.summary}`,
      memory_type: 'system', categories: ['mark', 'meeting', 'mar'], importance: 7,
      is_system: true, source: `mark_${Date.now()}`, tags: ['mark', 'meeting', 'mar']
    });
    
    const result = {
      agent: 'Meeting After Report Keeper (MARK)', status: 'complete',
      meetingTitle: mar.title, attendeeCount: mar.attendees.length,
      summaryLength: mar.summary.length, dispatchedToLuke: true
    };
    
    await reportToAIR('MARK', 'complete', result);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({
      agent: 'Meeting After Report Keeper (MARK)', status: 'error', error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
// We Are All ABA.
