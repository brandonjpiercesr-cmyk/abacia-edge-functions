/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Inbox Management Agent Navigator (IMAN)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.iman:FUNCTION:iman.email⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Inbox Management Agent Navigator             │
 * │ Acronym:      IMAN                                         │
 * │ Agent #:      57                                           │
 * │ Department:   EMAIL (Department Lead)                      │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → IMAN → Nylas API → Gmail               │
 * │ Type:         EMAIL_AGENT                                  │
 * │ Autonomous:   YES (every 15 min via pg_cron)               │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   YES (inbox contents via API)                 │
 * │ Tethered To:  AIR, Nylas API, Gmail, REACH (escalation)    │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.iman:FUNCTION:iman.email⬡        │
 * │ Location:     supabase/functions/iman/index.ts             │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT IMAN DOES:
 * 1. Fetches inbox via Nylas API
 * 2. Categorizes emails by urgency (low/med/high/critical)
 * 3. Detects patterns: job alerts, urgent requests, client emails
 * 4. Escalates urgent emails to REACH (triggers Law of Escalation)
 * 5. Can compose and send emails on Brandon's behalf
 * 
 * RISK CATEGORIES:
 * - LOW: Newsletters, notifications
 * - MEDIUM: Standard correspondence
 * - HIGH: Client requests, deadlines mentioned
 * - CRITICAL: Urgent, ASAP, emergency keywords
 * 
 * ROUTING TRACES:
 * - CRON*AIR*IMAN*NYLAS*GMAIL (inbox check)
 * - IMAN*AIR*REACH*ESCALATE (urgent detection)
 * - IMAN*LUKE*AIR (action extraction from emails)
 * 
 * TRIGGERS:
 * - pg_cron: '*/15 * * * *' (every 15 minutes)
 * - HTTP POST to /functions/v1/iman
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite } from '../_shared/brain-client.ts'
import { reportToAIR, escalateToREACH, dispatchAgent } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const NYLAS_API_KEY = Deno.env.get('NYLAS_API_KEY');
const NYLAS_GRANT_ID = Deno.env.get('NYLAS_GRANT_ID') || '41a3ace1-1c1e-47f3-b017-e5fd71ea1f3a';

interface IMANRequest {
  action?: 'fetch' | 'send' | 'check';
  limit?: number;
  to?: string;
  subject?: string;
  body?: string;
}

interface Email {
  id: string;
  from: any[];
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
}

const URGENT_KEYWORDS = ['urgent', 'asap', 'emergency', 'critical', 'immediate', 'deadline', 'today', 'eod'];
const JOB_KEYWORDS = ['idealist', 'job alert', 'new job', 'application', 'interview', 'position'];

function categorizeEmail(email: Email): { risk: string; urgency: number; type: string } {
  const content = `${email.subject} ${email.snippet}`.toLowerCase();
  
  // Check for urgent
  const isUrgent = URGENT_KEYWORDS.some(kw => content.includes(kw));
  if (isUrgent) {
    return { risk: 'critical', urgency: 9, type: 'urgent' };
  }
  
  // Check for job alerts
  const isJob = JOB_KEYWORDS.some(kw => content.includes(kw));
  if (isJob) {
    return { risk: 'high', urgency: 7, type: 'job_alert' };
  }
  
  // Check for client/work
  if (content.includes('client') || content.includes('meeting') || content.includes('deadline')) {
    return { risk: 'high', urgency: 6, type: 'work' };
  }
  
  // Default
  return { risk: 'low', urgency: 3, type: 'general' };
}

async function fetchInbox(limit: number = 10): Promise<Email[]> {
  const response = await fetch(
    `https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  return data.data || [];
}

async function sendEmail(to: string, subject: string, body: string): Promise<any> {
  const response = await fetch(
    `https://api.us.nylas.com/v3/grants/${NYLAS_GRANT_ID}/messages/send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NYLAS_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: [{ email: to }],
        subject,
        body
      })
    }
  );
  
  return response.json();
}

serve(async (req) => {
  try {
    const body: IMANRequest = await req.json().catch(() => ({}));
    const client = createBrainClient();
    
    const action = body.action || 'fetch';
    const limit = body.limit || 10;
    
    let result: any;
    
    if (action === 'send') {
      // Send email
      const trace = createTrace('AIR', 'IMAN', 'NYLAS', `Sending email to ${body.to}`, 'SENDING');
      
      const sendResult = await sendEmail(body.to!, body.subject!, body.body!);
      
      await logTrace({ ...trace, result: 'Email sent' });
      
      result = {
        agent: 'Inbox Management Agent Navigator (IMAN)',
        status: 'complete',
        action: 'send',
        sent: true,
        to: body.to
      };
      
    } else {
      // Fetch and categorize inbox
      const trace = createTrace('CRON', 'IMAN', 'NYLAS', 'Fetching inbox', 'FETCHING');
      
      const emails = await fetchInbox(limit);
      
      // Categorize each email
      const categorized = emails.map(email => ({
        id: email.id,
        from: email.from?.[0]?.email || 'unknown',
        subject: email.subject,
        snippet: email.snippet?.substring(0, 100),
        unread: email.unread,
        ...categorizeEmail(email)
      }));
      
      // Find critical emails
      const critical = categorized.filter(e => e.risk === 'critical');
      
      // Escalate critical emails
      for (const email of critical) {
        await escalateToREACH(
          9,
          `URGENT EMAIL from ${email.from}: ${email.subject}`,
          'iman_inbox_check'
        );
        
        createTrace('IMAN', 'REACH', 'ESCALATE', `Urgent: ${email.subject.substring(0, 30)}`, 'ESCALATED');
      }
      
      // Store job alerts in brain
      const jobAlerts = categorized.filter(e => e.type === 'job_alert');
      for (const job of jobAlerts) {
        await brainWrite(client, {
          content: `JOB ALERT: ${job.subject} - from ${job.from}`,
          memory_type: 'system',
          categories: ['job', 'email', 'alert'],
          importance: 7,
          is_system: true,
          source: `iman_job_${job.id}`,
          tags: ['job_alert', 'iman', 'action_needed']
        });
      }
      
      await logTrace({ ...trace, result: `${emails.length} emails, ${critical.length} critical, ${jobAlerts.length} jobs` });
      
      result = {
        agent: 'Inbox Management Agent Navigator (IMAN)',
        status: 'complete',
        action: 'fetch',
        total: emails.length,
        critical: critical.length,
        jobAlerts: jobAlerts.length,
        emails: categorized
      };
    }
    
    await reportToAIR('IMAN', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Inbox Management Agent Navigator (IMAN)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('IMAN', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
