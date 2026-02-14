/**
 * ⬡B:supabase.shared:UTILITY:brain.client⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9
 * 
 * Shared brain client for all Edge Function agents
 * Every agent uses this to read/write to the brain
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface BrainMemory {
  id?: string;
  content: string;
  memory_type: string;
  categories?: string[];
  importance?: number;
  is_system?: boolean;
  source?: string;
  tags?: string[];
  embedding?: number[];
}

export function createBrainClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

export async function brainRead(
  client: SupabaseClient,
  table: string = 'aba_memory',
  filters?: Record<string, any>
): Promise<any[]> {
  let query = client.from(table).select('*');
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });
  }
  
  const { data, error } = await query.order('importance', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

export async function brainWrite(
  client: SupabaseClient,
  memory: BrainMemory,
  table: string = 'aba_memory'
): Promise<any> {
  const { data, error } = await client
    .from(table)
    .insert({
      ...memory,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function brainSearch(
  client: SupabaseClient,
  query: string,
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await client
    .from('aba_memory')
    .select('*')
    .textSearch('content', query)
    .order('importance', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

export async function semanticSearch(
  client: SupabaseClient,
  embedding: number[],
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await client.rpc('match_memories', {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: limit
  });
  
  if (error) throw error;
  return data || [];
}

// We Are All ABA.
