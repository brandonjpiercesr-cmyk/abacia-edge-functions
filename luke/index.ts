/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Listening and Understanding Key Extracts (LUKE)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.luke:FUNCTION:luke.extract⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Listening and Understanding Key Extracts     │
 * │ Acronym:      LUKE                                         │
 * │ Agent #:      65                                           │
 * │ Department:   EXTRACTION (Department Lead)                 │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → LUKE → Brain (action_needed tag)       │
 * │ Type:         EXTRACTION_AGENT                             │
 * │ Autonomous:   YES (triggered by OMI transcripts)           │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   NO (stores results in brain)                 │
 * │ Tethered To:  AIR, OMI (via database trigger), Brain       │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.luke:FUNCTION:luke.extract⬡      │
 * │ Location:     supabase/functions/luke/index.ts             │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT LUKE DOES:
 * 1. Receives transcript from OMI or direct input
 * 2. Pattern matches for action items:
 *    - "need to", "have to", "should", "must"
 *    - "remind me", "don't forget"
 *    - "call", "email", "text", "contact"
 *    - "buy", "get", "pick up", "order"
 *    - "schedule", "book", "set up"
 * 3. Assigns urgency score (1-10)
 * 4. Stores in brain with 'action_needed' tag
 * 5. Escalates urgent items (≥8) to REACH
 * 
 * ROUTING TRACES:
 * - OMI*AIR*LUKE*AIR*BRAIN (from OMI transcript)
 * - LUKE*BRAIN*LUKE (store action items)
 * - LUKE*REACH*ESCALATE (urgent items)
 * 
 * TRIGGERS:
 * - Database trigger on omi_transcripts INSERT
 * - HTTP POST to /functions/v1/luke
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR, escalateToREACH } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

interface LUKERequest {
  content?: string;
  transcript_id?: string;
  source?: 'omi' | 'manual' | 'email';
}

interface ActionItem {
  text: string;
  type: string;
  urgency: number;
  confidence: number;
}

const ACTION_PATTERNS = [
  { pattern: /(?:need to|have to|should|must|will|gonna|going to)\s+(.+?)(?:\.|$|,)/gi, type: 'task', baseUrgency: 6 },
  { pattern: /(?:remind me to|don't forget to|remember to)\s+(.+?)(?:\.|$|,)/gi, type: 'reminder', baseUrgency: 7 },
  { pattern: /(?:call|phone|ring)\s+(.+?)(?:\.|$|,)/gi, type: 'call', baseUrgency: 7 },
  { pattern: /(?:email|write to|send to|message)\s+(.+?)(?:\.|$|,)/gi, type: 'email', baseUrgency: 5 },
  { pattern: /(?:text|sms)\s+(.+?)(?:\.|$|,)/gi, type: 'text', baseUrgency: 6 },
  { pattern: /(?:buy|get|pick up|order|purchase)\s+(.+?)(?:\.|$|,)/gi, type: 'purchase', baseUrgency: 5 },
  { pattern: /(?:schedule|book|set up|arrange)\s+(.+?)(?:\.|$|,)/gi, type: 'schedule', baseUrgency: 7 },
  { pattern: /(?:meeting with|meet with|call with)\s+(.+?)(?:\.|$|,)/gi, type: 'meeting', baseUrgency: 8 },
  { pattern: /(?:deadline|due|by end of|eod|asap)\s*(?:for|on|is)?\s*(.+?)(?:\.|$|,)/gi, type: 'deadline', baseUrgency: 9 },
  { pattern: /(?:urgent|important|critical|priority)\s*:?\s*(.+?)(?:\.|$|,)/gi, type: 'urgent', baseUrgency: 10 },
];

function extractActionItems(content: string): ActionItem[] {
  const items: ActionItem[] = [];
  const seen = new Set<string>();
  
  for (const { pattern, type, baseUrgency } of ACTION_PATTERNS) {
    const matches = content.matchAll(pattern);
    
    for (const match of matches) {
      const text = match[1]?.trim();
      
      // Validate
      if (!text || text.length < 5 || text.length > 200) continue;
      
      // Dedupe
      const key = text.toLowerCase().substring(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);
      
      // Calculate urgency modifiers
      let urgency = baseUrgency;
      if (/today|tonight|asap|urgent|immediately/i.test(text)) urgency = Math.min(10, urgency + 2);
      if (/tomorrow|next week/i.test(text)) urgency = Math.max(1, urgency - 1);
      
      items.push({
        text,
        type,
        urgency,
        confidence: 0.8
      });
    }
  }
  
  return items.sort((a, b) => b.urgency - a.urgency);
}

serve(async (req) => {
  try {
    const body: LUKERequest = await req.json();
    const client = createBrainClient();
    
    const content = body.content || '';
    const source = body.source || 'manual';
    
    if (!content || content.length < 10) {
      return new Response(JSON.stringify({
        agent: 'Listening and Understanding Key Extracts (LUKE)',
        status: 'skipped',
        reason: 'Content too short'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    const trace = createTrace(
      source === 'omi' ? 'OMI' : 'AIR',
      'LUKE',
      'AIR',
      `Extracting from ${content.length} chars`,
      'EXTRACTING'
    );
    
    // Extract action items
    const items = extractActionItems(content);
    
    // Store each item in brain
    for (const item of items) {
      await brainWrite(client, {
        content: `ACTION ITEM [${item.type.toUpperCase()}] (urgency ${item.urgency}/10): ${item.text}`,
        memory_type: 'system',
        categories: ['action_item', item.type, 'luke'],
        importance: item.urgency,
        is_system: true,
        source: `luke_${source}_${Date.now()}`,
        tags: ['action_needed', 'luke', item.type, source]
      });
      
      // Escalate urgent items
      if (item.urgency >= 8) {
        await escalateToREACH(
          item.urgency,
          `URGENT ${item.type.toUpperCase()}: ${item.text}`,
          'luke_extract'
        );
        
        createTrace('LUKE', 'REACH', 'ESCALATE', `Urgent: ${item.text.substring(0, 30)}`, 'ESCALATED');
      }
    }
    
    await logTrace({ ...trace, result: `Extracted ${items.length} items` });
    
    const result = {
      agent: 'Listening and Understanding Key Extracts (LUKE)',
      status: 'complete',
      source,
      contentLength: content.length,
      itemsExtracted: items.length,
      urgentItems: items.filter(i => i.urgency >= 8).length,
      items: items.slice(0, 20)
    };
    
    await reportToAIR('LUKE', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Listening and Understanding Key Extracts (LUKE)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('LUKE', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
