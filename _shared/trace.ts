/**
 * ⬡B:supabase.shared:UTILITY:trace⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9
 * 
 * A*V*A Routing Trace for all agents
 * DNA STRAND: TRIGGER*AIR*AGENT*AIR*DELIVERY
 */

import { createBrainClient, brainWrite } from './brain-client.ts';

export interface TraceEntry {
  notation: string;
  action: string;
  result: string;
  timestamp: string;
  agent: string;
}

export function createTrace(
  passer: string,
  agent: string,
  receiver: string,
  action: string,
  result: string = 'OK'
): TraceEntry {
  const entry: TraceEntry = {
    notation: `${passer}*${agent}*${receiver}`,
    action,
    result,
    timestamp: new Date().toISOString(),
    agent
  };
  
  console.log(`[TRACE] ${entry.notation} | ${action} | ${result}`);
  return entry;
}

export async function logTrace(trace: TraceEntry): Promise<void> {
  try {
    const client = createBrainClient();
    await brainWrite(client, {
      content: `TRACE [${trace.timestamp}]: ${trace.notation} | ${trace.action} | ${trace.result}`,
      memory_type: 'system',
      categories: ['trace', trace.agent.toLowerCase()],
      importance: 2,
      is_system: true,
      source: `trace_${trace.agent}_${Date.now()}`,
      tags: ['trace', 'routing', trace.agent.toLowerCase()]
    });
  } catch (err) {
    console.error('[TRACE] Failed to log:', err.message);
  }
}

// We Are All ABA.
