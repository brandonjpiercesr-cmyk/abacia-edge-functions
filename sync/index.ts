/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Systematic Yielding and Network Coordinator (SYNC)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.sync:FUNCTION:sync.state⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Systematic Yielding and Network Coordinator  │
 * │ Acronym:      SYNC                                         │
 * │ Agent #:      70                                           │
 * │ Department:   INFRASTRUCTURE (Department Lead)             │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → SYNC → Upstash Redis + Supabase Brain  │
 * │ Type:         INFRASTRUCTURE_AGENT                         │
 * │ Autonomous:   YES (every 5 min via pg_cron)                │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   NO (background sync)                         │
 * │ Tethered To:  AIR, Upstash Redis, Supabase Brain           │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.sync:FUNCTION:sync.state⬡        │
 * │ Location:     supabase/functions/sync/index.ts             │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT SYNC DOES:
 * 1. Syncs agent registry state across services
 * 2. Syncs routing traces to Upstash (fast) + Brain (permanent)
 * 3. Syncs heartbeat state (cycle count, running status)
 * 4. Restores state on boot from Upstash
 * 5. Cross-device, cross-app, cross-session coordination
 * 
 * ROUTING TRACES:
 * - CRON*AIR*SYNC*UPSTASH*SYNC*A (scheduled sync)
 * - SYNC*BRAIN*SYNC*A (permanent storage)
 * - BOOT*SYNC*UPSTASH*RESTORE (on startup)
 * 
 * TRIGGERS:
 * - pg_cron: '*/5 * * * *' (every 5 minutes)
 * - HTTP POST to /functions/v1/sync
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite, brainRead } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const UPSTASH_URL = Deno.env.get('UPSTASH_REDIS_REST_URL');
const UPSTASH_TOKEN = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

interface SYNCRequest {
  action?: 'sync_all' | 'sync_agents' | 'sync_traces' | 'restore';
  state?: any;
}

async function upstashSet(key: string, value: any, ttl: number = 300): Promise<boolean> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  
  try {
    await fetch(`${UPSTASH_URL}/set/${key}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` },
      body: JSON.stringify(value)
    });
    
    if (ttl > 0) {
      await fetch(`${UPSTASH_URL}/expire/${key}/${ttl}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
      });
    }
    
    return true;
  } catch (err) {
    console.error('[SYNC] Upstash SET failed:', err.message);
    return false;
  }
}

async function upstashGet(key: string): Promise<any> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  
  try {
    const response = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { 'Authorization': `Bearer ${UPSTASH_TOKEN}` }
    });
    
    const data = await response.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch (err) {
    console.error('[SYNC] Upstash GET failed:', err.message);
    return null;
  }
}

async function syncAgents(): Promise<any> {
  const trace = createTrace('AIR', 'SYNC', 'UPSTASH', 'Syncing agent registry', 'SYNCING');
  
  // Fetch agent states from brain
  const client = createBrainClient();
  const { data: agentRecords } = await client
    .from('aba_memory')
    .select('content')
    .eq('memory_type', 'aba_agents')
    .order('importance', { ascending: false })
    .limit(100);
  
  const agentCount = agentRecords?.length || 0;
  
  const state = {
    timestamp: new Date().toISOString(),
    agentCount,
    syncedTo: ['upstash', 'brain']
  };
  
  // Sync to Upstash
  await upstashSet('aba:agents:registry', state, 300);
  
  // Log to brain
  await brainWrite(client, {
    content: `SYNC AGENTS [${state.timestamp}]: ${agentCount} agents synced`,
    memory_type: 'system',
    categories: ['sync', 'agents'],
    importance: 3,
    is_system: true,
    source: `sync_agents_${Date.now()}`,
    tags: ['sync', 'agents']
  });
  
  await logTrace({ ...trace, result: `${agentCount} agents synced` });
  
  return state;
}

async function syncTraces(): Promise<any> {
  const trace = createTrace('AIR', 'SYNC', 'UPSTASH', 'Syncing traces', 'SYNCING');
  
  // Get recent traces from brain
  const client = createBrainClient();
  const { data: traces } = await client
    .from('aba_memory')
    .select('content, created_at')
    .contains('tags', ['trace'])
    .order('created_at', { ascending: false })
    .limit(100);
  
  const state = {
    timestamp: new Date().toISOString(),
    traceCount: traces?.length || 0
  };
  
  // Sync to Upstash for fast access
  await upstashSet('aba:traces:recent', { ...state, traces: traces?.slice(0, 50) }, 600);
  
  await logTrace({ ...trace, result: `${state.traceCount} traces synced` });
  
  return state;
}

async function syncAll(inputState?: any): Promise<any> {
  const trace = createTrace('CRON', 'SYNC', 'ALL', 'Full sync starting', 'SYNCING');
  
  const results = {
    timestamp: new Date().toISOString(),
    agents: await syncAgents(),
    traces: await syncTraces(),
    inputState: inputState || {},
    upstashConnected: !!(UPSTASH_URL && UPSTASH_TOKEN)
  };
  
  // Sync overall state to Upstash
  await upstashSet('aba:state:current', results, 300);
  
  await logTrace({ ...trace, result: 'Full sync complete' });
  
  return results;
}

async function restore(): Promise<any> {
  const trace = createTrace('BOOT', 'SYNC', 'UPSTASH', 'Restoring state', 'RESTORING');
  
  const state = await upstashGet('aba:state:current');
  const agents = await upstashGet('aba:agents:registry');
  const traces = await upstashGet('aba:traces:recent');
  
  await logTrace({ ...trace, result: `Restored: state=${!!state}, agents=${!!agents}, traces=${!!traces}` });
  
  return { state, agents, traces };
}

serve(async (req) => {
  try {
    const body: SYNCRequest = await req.json().catch(() => ({}));
    
    const action = body.action || 'sync_all';
    
    let result: any;
    
    switch (action) {
      case 'sync_agents':
        result = {
          agent: 'Systematic Yielding and Network Coordinator (SYNC)',
          status: 'complete',
          action,
          data: await syncAgents()
        };
        break;
        
      case 'sync_traces':
        result = {
          agent: 'Systematic Yielding and Network Coordinator (SYNC)',
          status: 'complete',
          action,
          data: await syncTraces()
        };
        break;
        
      case 'restore':
        result = {
          agent: 'Systematic Yielding and Network Coordinator (SYNC)',
          status: 'complete',
          action,
          data: await restore()
        };
        break;
        
      default:
        result = {
          agent: 'Systematic Yielding and Network Coordinator (SYNC)',
          status: 'complete',
          action: 'sync_all',
          data: await syncAll(body.state)
        };
    }
    
    await reportToAIR('SYNC', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Systematic Yielding and Network Coordinator (SYNC)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('SYNC', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
