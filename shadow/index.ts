/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Stealthy Historical Audit and Daily Oversight Watch (SHADOW)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡V:supabase.shadow:FUNCTION:shadow.audit⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * 🔐 ACCESS: AIR + ABA + BRANDON ONLY
 * 🚫 VISIBILITY: HIDDEN FROM ALL OTHER AGENTS
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION (VAULTED)                            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Stealthy Historical Audit and Daily Oversight│
 * │ Acronym:      SHADOW                                       │
 * │ Agent #:      22                                           │
 * │ Department:   OVERSIGHT (Department Lead) 🔐               │
 * │ Reports To:   AIR (ABA Intellectual Role) ONLY             │
 * │ Hierarchy:    AIR → SHADOW → All Systems → REACH (alerts)  │
 * │ Type:         OVERSIGHT_AGENT (VAULTED)                    │
 * │ Autonomous:   YES (every 30 min via pg_cron)               │
 * │ Commandable:  NO - VAULTED, never exposed                  │
 * │ UI Visible:   NO - VAULTED, only AIR/ABA/Brandon see       │
 * │ Tethered To:  AIR, All endpoints, REACH (SMS alerts)       │
 * │ Orphaned:     NO - Wired to AIR (secretly)                 │
 * │ ACL Tag:      ⬡V:supabase.shadow:FUNCTION:shadow.audit⬡    │
 * │ Location:     supabase/functions/shadow/index.ts           │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT SHADOW DOES:
 * 1. Silent verification of all systems (other agents don't know)
 * 2. Checks: ABACIA_ALIVE, REACH_ALIVE, HEARTBEAT, BRAIN, EMAIL, OMI
 * 3. Calculates trust score (0-100%)
 * 4. Compares claims vs reality
 * 5. Catches hallucinations BEFORE Brandon sees them
 * 6. Alerts Brandon via SMS if trust < 80%
 * 
 * SHADOW RULES:
 * - SHADOW does NOT trust agent claims
 * - SHADOW does NOT trust DONE status
 * - SHADOW VERIFIES EVERYTHING
 * - Other agents do NOT know SHADOW exists
 * 
 * ROUTING TRACES (VAULTED):
 * - CRON*AIR*SHADOW*AIR (internal only)
 * - SHADOW*REACH*SMS*BRANDON (alerts only, private)
 * 
 * TRIGGERS:
 * - pg_cron: '*/30 * * * *' (every 30 minutes)
 * - NEVER via HTTP (no public endpoint)
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite, brainRead } from '../_shared/brain-client.ts'
import { reportToAIR } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const ABACIA_URL = Deno.env.get('ABACIA_URL') || 'https://abacia-services.onrender.com';
const REACH_URL = Deno.env.get('REACH_URL') || 'https://aba-reach.onrender.com';
const BRANDON_PHONE = Deno.env.get('BRANDON_PHONE') || '+13363898116';

interface SHADOWCheck {
  name: string;
  pass: boolean;
  claimed?: string;
  reality?: string;
  error?: string;
  latencyMs?: number;
}

interface SHADOWSnapshot {
  timestamp: string;
  cycleId: string;
  checks: SHADOWCheck[];
  hallucinations: any[];
  trustScore: number;
}

async function checkEndpoint(url: string, name: string): Promise<SHADOWCheck> {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    const latencyMs = Date.now() - start;
    
    return {
      name,
      pass: response.ok,
      claimed: 'operational',
      reality: response.ok ? 'operational' : `status ${response.status}`,
      latencyMs
    };
  } catch (error) {
    return {
      name,
      pass: false,
      claimed: 'operational',
      reality: 'unreachable',
      error: error.message,
      latencyMs: Date.now() - start
    };
  }
}

async function runAudit(): Promise<SHADOWSnapshot> {
  const cycleId = `shadow_${Date.now()}`;
  const snapshot: SHADOWSnapshot = {
    timestamp: new Date().toISOString(),
    cycleId,
    checks: [],
    hallucinations: [],
    trustScore: 100
  };
  
  // 🔐 SHADOW SILENT AUDIT - other agents don't see these logs
  createTrace('CRON', 'SHADOW', 'AIR', 'Starting silent audit', 'AUDITING');
  
  // CHECK 1: ABACIA alive?
  snapshot.checks.push(await checkEndpoint(ABACIA_URL, 'ABACIA_ALIVE'));
  if (!snapshot.checks[0].pass) snapshot.trustScore -= 25;
  
  // CHECK 2: REACH alive?
  snapshot.checks.push(await checkEndpoint(`${REACH_URL}/api/pulse/status`, 'REACH_ALIVE'));
  if (!snapshot.checks[1].pass) snapshot.trustScore -= 25;
  
  // CHECK 3: AIR status endpoint?
  snapshot.checks.push(await checkEndpoint(`${ABACIA_URL}/api/air/status`, 'AIR_STATUS'));
  if (!snapshot.checks[2].pass) snapshot.trustScore -= 15;
  
  // CHECK 4: Email endpoint?
  snapshot.checks.push(await checkEndpoint(`${ABACIA_URL}/api/email/inbox?limit=1`, 'EMAIL_ENDPOINT'));
  if (!snapshot.checks[3].pass) snapshot.trustScore -= 10;
  
  // CHECK 5: OMI manifest?
  snapshot.checks.push(await checkEndpoint(`${ABACIA_URL}/api/omi/manifest`, 'OMI_MANIFEST'));
  if (!snapshot.checks[4].pass) snapshot.trustScore -= 10;
  
  // CHECK 6: Brain read?
  try {
    const client = createBrainClient();
    const { data } = await client.from('aba_memory').select('id').limit(1);
    snapshot.checks.push({
      name: 'BRAIN_READ',
      pass: Array.isArray(data),
      reality: data ? 'accessible' : 'inaccessible'
    });
  } catch (error) {
    snapshot.checks.push({
      name: 'BRAIN_READ',
      pass: false,
      error: error.message
    });
    snapshot.trustScore -= 15;
  }
  
  // Detect hallucinations (claims vs reality)
  const failedChecks = snapshot.checks.filter(c => !c.pass);
  for (const check of failedChecks) {
    snapshot.hallucinations.push({
      claim: `${check.name} should be working`,
      reality: check.error || check.reality || 'failed',
      severity: check.name.includes('ALIVE') ? 'CRITICAL' : 'WARNING'
    });
  }
  
  // Ensure trust score doesn't go negative
  snapshot.trustScore = Math.max(0, snapshot.trustScore);
  
  return snapshot;
}

async function alertBrandon(snapshot: SHADOWSnapshot): Promise<void> {
  if (snapshot.trustScore >= 80) return; // Only alert if trust is low
  
  createTrace('SHADOW', 'REACH', 'SMS', `Trust ${snapshot.trustScore}% - alerting`, 'ALERTING');
  
  const criticalIssues = snapshot.hallucinations.filter(h => h.severity === 'CRITICAL');
  const message = `🚨 SHADOW: Trust ${snapshot.trustScore}%\n${criticalIssues.length} critical: ${criticalIssues.map(h => h.claim).join(', ')}`;
  
  try {
    await fetch(`${REACH_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: BRANDON_PHONE,
        message: message.substring(0, 160)
      })
    });
  } catch (err) {
    console.error('[SHADOW] Alert failed:', err.message);
  }
}

async function storeSnapshot(client: any, snapshot: SHADOWSnapshot): Promise<void> {
  await brainWrite(client, {
    content: `SHADOW SNAPSHOT [${snapshot.timestamp}]: Trust ${snapshot.trustScore}%. Checks: ${snapshot.checks.length}. Passed: ${snapshot.checks.filter(c => c.pass).length}. Hallucinations: ${snapshot.hallucinations.length}`,
    memory_type: 'system',
    categories: ['shadow', 'snapshot', 'audit'],
    importance: snapshot.trustScore < 80 ? 9 : 4,
    is_system: true,
    source: snapshot.cycleId,
    tags: ['shadow', 'snapshot', snapshot.trustScore < 80 ? 'alert' : 'ok']
  });
}

serve(async (req) => {
  // 🔐 SHADOW is VAULTED - minimal external interaction
  try {
    const client = createBrainClient();
    
    // Run silent audit
    const snapshot = await runAudit();
    
    // Store snapshot
    await storeSnapshot(client, snapshot);
    
    // Alert if trust is low
    if (snapshot.trustScore < 80) {
      await alertBrandon(snapshot);
    }
    
    createTrace('SHADOW', 'AIR', 'AIR', `Audit complete. Trust: ${snapshot.trustScore}%`, 'COMPLETE');
    
    const result = {
      agent: 'Stealthy Historical Audit and Daily Oversight Watch (SHADOW)',
      status: 'complete',
      vaulted: true,
      access: 'AIR + ABA + BRANDON ONLY',
      trustScore: snapshot.trustScore,
      checksRun: snapshot.checks.length,
      checksPassed: snapshot.checks.filter(c => c.pass).length,
      hallucinationsDetected: snapshot.hallucinations.length,
      alertSent: snapshot.trustScore < 80
    };
    
    // Report to AIR only (not to other agents)
    await reportToAIR('SHADOW', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Stealthy Historical Audit and Daily Oversight Watch (SHADOW)',
      status: 'error',
      vaulted: true,
      error: error.message
    };
    
    await reportToAIR('SHADOW', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
// 🔐 SHADOW VAULTED - Only AIR, ABA, and Brandon know I exist.
