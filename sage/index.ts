/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Strategic Assessment and Governance Engine (SAGE)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.sage:FUNCTION:sage.search⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Strategic Assessment and Governance Engine   │
 * │ Acronym:      SAGE                                         │
 * │ Agent #:      53                                           │
 * │ Department:   INDEXING                                     │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → SAGE → Supabase Brain                  │
 * │ Type:         SEARCH_AGENT                                 │
 * │ Autonomous:   YES (on-demand + background backfill)        │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   YES (search results appear in responses)     │
 * │ Tethered To:  AIR, Supabase pgvector, OpenAI embeddings    │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.sage:FUNCTION:sage.search⬡       │
 * │ Location:     supabase/functions/sage/index.ts             │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT SAGE DOES:
 * 1. Receives search queries from AIR
 * 2. Generates embeddings via OpenAI text-embedding-3-small
 * 3. Queries Supabase using pgvector similarity search
 * 4. Returns ranked results with relevance scores
 * 5. Can backfill embeddings for memories that don't have them
 * 
 * ROUTING TRACES:
 * - TRIGGER*AIR*SAGE*AIR*DELIVERY (standard flow)
 * - A*SAGE*SUPABASE*SAGE*A (brain search)
 * - A*SAGE*OPENAI*SAGE*A (embedding generation)
 * 
 * TRIGGERS:
 * - HTTP POST to /functions/v1/sage
 * - AIR dispatch for search queries
 * - Cron for backfill (optional)
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainSearch, semanticSearch, brainWrite, brainRead } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

interface SAGERequest {
  query?: string;
  action?: 'search' | 'semantic' | 'backfill';
  limit?: number;
  intent?: any;
  request?: any;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000)
    })
  });
  
  const data = await response.json();
  return data.data[0].embedding;
}

async function handleSearch(client: any, query: string, limit: number): Promise<any> {
  // Log trace
  const trace = createTrace('AIR', 'SAGE', 'SUPABASE', `Searching: ${query.substring(0, 50)}`, 'SEARCHING');
  
  // Text search
  const results = await brainSearch(client, query, limit);
  
  await logTrace({ ...trace, result: `Found ${results.length} results` });
  
  return {
    agent: 'Strategic Assessment and Governance Engine (SAGE)',
    status: 'complete',
    searchType: 'text',
    query,
    found: results.length,
    results: results.map(r => ({
      id: r.id,
      preview: r.content?.substring(0, 200),
      type: r.memory_type,
      importance: r.importance,
      tags: r.tags
    }))
  };
}

async function handleSemanticSearch(client: any, query: string, limit: number): Promise<any> {
  const trace = createTrace('AIR', 'SAGE', 'OPENAI', `Generating embedding for: ${query.substring(0, 30)}`, 'EMBEDDING');
  
  // Generate embedding
  const embedding = await generateEmbedding(query);
  
  await logTrace({ ...trace, result: 'Embedding generated' });
  
  // Semantic search
  const results = await semanticSearch(client, embedding, limit);
  
  return {
    agent: 'Strategic Assessment and Governance Engine (SAGE)',
    status: 'complete',
    searchType: 'semantic',
    query,
    found: results.length,
    results: results.map(r => ({
      id: r.id,
      preview: r.content?.substring(0, 200),
      type: r.memory_type,
      importance: r.importance,
      similarity: r.similarity
    }))
  };
}

async function handleBackfill(client: any, batchSize: number = 10): Promise<any> {
  const trace = createTrace('CRON', 'SAGE', 'SUPABASE', 'Starting embedding backfill', 'BACKFILLING');
  
  // Get memories without embeddings
  const { data: memories, error } = await client
    .from('aba_memory')
    .select('id, content')
    .is('embedding', null)
    .limit(batchSize);
  
  if (error) throw error;
  
  let processed = 0;
  for (const memory of memories || []) {
    try {
      const embedding = await generateEmbedding(memory.content);
      await client
        .from('aba_memory')
        .update({ embedding })
        .eq('id', memory.id);
      processed++;
    } catch (err) {
      console.error(`Failed to embed ${memory.id}:`, err.message);
    }
  }
  
  await logTrace({ ...trace, result: `Processed ${processed}/${memories?.length || 0}` });
  
  return {
    agent: 'Strategic Assessment and Governance Engine (SAGE)',
    status: 'complete',
    action: 'backfill',
    processed,
    total: memories?.length || 0
  };
}

serve(async (req) => {
  try {
    const body: SAGERequest = await req.json();
    const client = createBrainClient();
    
    const action = body.action || 'search';
    const query = body.query || body.intent?.content || '';
    const limit = body.limit || 10;
    
    let result;
    
    switch (action) {
      case 'semantic':
        result = await handleSemanticSearch(client, query, limit);
        break;
      case 'backfill':
        result = await handleBackfill(client, limit);
        break;
      default:
        result = await handleSearch(client, query, limit);
    }
    
    // Report to AIR
    await reportToAIR('SAGE', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Strategic Assessment and Governance Engine (SAGE)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('SAGE', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
