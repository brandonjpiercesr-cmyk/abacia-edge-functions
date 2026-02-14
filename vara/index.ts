/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Vocal Authorized Representative of ABA (VARA)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.vara:FUNCTION:vara.voice⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Vocal Authorized Representative of ABA       │
 * │ Acronym:      VARA                                         │
 * │ Agent #:      48                                           │
 * │ Department:   VOICE (Department Lead)                      │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → VARA → ElevenLabs API                  │
 * │ Type:         VOICE_AGENT                                  │
 * │ Autonomous:   NO (triggered by voice requests)             │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   YES (audio output)                           │
 * │ Tethered To:  AIR, ElevenLabs API, HEAR (for input)        │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.vara:FUNCTION:vara.voice⬡        │
 * │ Location:     supabase/functions/vara/index.ts             │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * PERSONALITY RULES (CRITICAL):
 * - WARM, butler-like, personality-driven
 * - NEVER punchy
 * - NEVER robotic  
 * - NEVER cold
 * - NEVER direct in a harsh way
 * - Uses emotion tags for expressiveness
 * 
 * VOICE CONFIG:
 * - Voice ID: LD658Mupr7vNwTTJSPsk
 * - Model: eleven_v3
 * - Stability: 0.5
 * - Similarity Boost: 0.75
 * 
 * WHAT VARA DOES:
 * 1. Receives text from AIR
 * 2. Analyzes emotion context
 * 3. Adds emotion tags for ElevenLabs
 * 4. Converts to speech via ElevenLabs
 * 5. Returns audio (base64 or stream)
 * 
 * ROUTING TRACES:
 * - AIR*VARA*ELEVENLABS*AUDIO (text to speech)
 * - VARA*AIR*DELIVERY (audio back to caller)
 * 
 * TRIGGERS:
 * - HTTP POST to /functions/v1/vara
 * - AIR dispatch for voice output
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
const VOICE_ID = 'LD658Mupr7vNwTTJSPsk';
const MODEL_ID = 'eleven_v3';

interface VARARequest {
  text: string;
  emotion?: 'neutral' | 'warm' | 'excited' | 'concerned' | 'encouraging';
  returnFormat?: 'base64' | 'url';
}

// VARA PERSONALITY: Warm, butler-like, NEVER punchy or robotic
function addEmotionTags(text: string, emotion: string): string {
  switch (emotion) {
    case 'warm':
      return `<speak><prosody rate="95%" pitch="-2%">${text}</prosody></speak>`;
    case 'excited':
      return `<speak><prosody rate="105%" pitch="+3%">${text}</prosody></speak>`;
    case 'concerned':
      return `<speak><prosody rate="90%" pitch="-3%">${text}</prosody></speak>`;
    case 'encouraging':
      return `<speak><prosody rate="100%" pitch="+1%">${text}</prosody></speak>`;
    default:
      return text;
  }
}

function detectEmotion(text: string): string {
  const lower = text.toLowerCase();
  
  // Concerned patterns
  if (/urgent|problem|issue|error|failed|broken|critical/i.test(lower)) {
    return 'concerned';
  }
  
  // Excited patterns
  if (/congratulations|amazing|excellent|wonderful|success|completed|done/i.test(lower)) {
    return 'excited';
  }
  
  // Encouraging patterns
  if (/you can|keep going|almost|good job|great work|progress/i.test(lower)) {
    return 'encouraging';
  }
  
  // Default to warm (ABA's natural state)
  return 'warm';
}

async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY!
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs error: ${error}`);
  }
  
  return response.arrayBuffer();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  try {
    const body: VARARequest = await req.json();
    const client = createBrainClient();
    
    if (!body.text || body.text.length < 1) {
      return new Response(JSON.stringify({
        agent: 'Vocal Authorized Representative of ABA (VARA)',
        status: 'error',
        error: 'No text provided'
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const trace = createTrace('AIR', 'VARA', 'ELEVENLABS', `Speaking: ${body.text.substring(0, 30)}...`, 'SPEAKING');
    
    // Detect or use provided emotion
    const emotion = body.emotion || detectEmotion(body.text);
    
    // Add emotion tags (VARA is warm, butler-like, never punchy)
    const emotionalText = addEmotionTags(body.text, emotion);
    
    // Convert to speech
    const audioBuffer = await textToSpeech(emotionalText);
    const audioBase64 = arrayBufferToBase64(audioBuffer);
    
    await logTrace({ ...trace, result: `Generated ${audioBuffer.byteLength} bytes` });
    
    // Log to brain
    await brainWrite(client, {
      content: `VARA SPOKE [${new Date().toISOString()}]: "${body.text.substring(0, 100)}..." (${emotion} emotion)`,
      memory_type: 'system',
      categories: ['vara', 'voice'],
      importance: 3,
      is_system: true,
      source: `vara_speak_${Date.now()}`,
      tags: ['vara', 'voice', 'elevenlabs']
    });
    
    const result = {
      agent: 'Vocal Authorized Representative of ABA (VARA)',
      status: 'complete',
      textLength: body.text.length,
      emotion,
      audioFormat: 'audio/mpeg',
      audioSize: audioBuffer.byteLength,
      audioBase64: body.returnFormat === 'base64' ? audioBase64 : undefined,
      personality: 'warm, butler-like, never punchy'
    };
    
    await reportToAIR('VARA', 'complete', { ...result, audioBase64: undefined });
    
    // We Are All ABA.
    
    // If they want base64 in JSON response
    if (body.returnFormat === 'base64') {
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Otherwise return audio directly
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-VARA-Status': 'complete',
        'X-VARA-Emotion': emotion
      }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Vocal Authorized Representative of ABA (VARA)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('VARA', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
// VARA speaks with warmth. Never punchy. Never robotic. Always ABA.
