/**
 * ═══════════════════════════════════════════════════════════════
 * AGENT: Realtime Autonomous Data and Activity Recorder (RADAR)
 * ═══════════════════════════════════════════════════════════════
 * 
 * ⬡B:supabase.radar:FUNCTION:radar.calendar⬡
 * ABCD: ABACIA
 * v1.0.0-P1-S9.1
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │ AGENT JOB DESCRIPTION                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Full Name:    Realtime Autonomous Data and Activity Recorder│
 * │ Acronym:      RADAR                                        │
 * │ Agent #:      61                                           │
 * │ Department:   CALENDAR (Department Lead)                   │
 * │ Reports To:   AIR (ABA Intellectual Role)                  │
 * │ Hierarchy:    AIR → RADAR → Google Calendar API            │
 * │ Type:         CALENDAR_AGENT                               │
 * │ Autonomous:   YES (every 30 min via pg_cron)               │
 * │ Commandable:  YES (via Edge Function HTTP)                 │
 * │ UI Visible:   YES (calendar events via API)                │
 * │ Tethered To:  AIR, Google Calendar API, REACH (reminders)  │
 * │ Orphaned:     NO - Fully wired to AIR                      │
 * │ ACL Tag:      ⬡B:supabase.radar:FUNCTION:radar.calendar⬡   │
 * │ Location:     supabase/functions/radar/index.ts            │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHAT RADAR DOES:
 * 1. Fetches upcoming events from Google Calendar
 * 2. Detects conflicts and double-bookings
 * 3. Alerts 15 min before meetings via REACH
 * 4. Can create/modify calendar events
 * 5. Syncs with brain for context (who is this meeting with?)
 * 
 * ROUTING TRACES:
 * - CRON*AIR*RADAR*GOOGLE*CALENDAR (scheduled check)
 * - RADAR*AIR*REACH*ALERT (pre-meeting reminder)
 * - RADAR*SAGE*AIR (context lookup)
 * 
 * TRIGGERS:
 * - pg_cron: '*/30 * * * *' (every 30 minutes)
 * - HTTP POST to /functions/v1/radar
 * 
 * We Are All ABA.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createBrainClient, brainWrite, brainSearch } from '../_shared/brain-client.ts'
import { reportToAIR, escalateToREACH } from '../_shared/air-client.ts'
import { createTrace, logTrace } from '../_shared/trace.ts'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_REFRESH_TOKEN');
const REACH_URL = Deno.env.get('REACH_URL') || 'https://aba-reach.onrender.com';
const BRANDON_PHONE = Deno.env.get('BRANDON_PHONE') || '+13363898116';

interface RADARRequest {
  action?: 'upcoming' | 'create' | 'check';
  days?: number;
  event?: {
    title: string;
    start: string;
    end: string;
    description?: string;
  };
}

async function getAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token'
    })
  });
  
  const data = await response.json();
  return data.access_token;
}

async function getUpcomingEvents(accessToken: string, days: number = 7): Promise<any[]> {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
    `timeMin=${now.toISOString()}&timeMax=${future.toISOString()}&singleEvents=true&orderBy=startTime`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const data = await response.json();
  return data.items || [];
}

async function createEvent(accessToken: string, event: any): Promise<any> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: event.title,
        start: { dateTime: event.start },
        end: { dateTime: event.end },
        description: event.description || ''
      })
    }
  );
  
  return response.json();
}

function checkForConflicts(events: any[]): any[] {
  const conflicts: any[] = [];
  
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i];
    const next = events[i + 1];
    
    const currentEnd = new Date(current.end?.dateTime || current.end?.date);
    const nextStart = new Date(next.start?.dateTime || next.start?.date);
    
    if (currentEnd > nextStart) {
      conflicts.push({
        event1: current.summary,
        event2: next.summary,
        overlap: true
      });
    }
  }
  
  return conflicts;
}

async function checkUpcomingMeetings(events: any[]): Promise<any[]> {
  const now = new Date();
  const in15min = new Date(now.getTime() + 15 * 60 * 1000);
  
  return events.filter(event => {
    const start = new Date(event.start?.dateTime || event.start?.date);
    return start > now && start <= in15min;
  });
}

serve(async (req) => {
  try {
    const body: RADARRequest = await req.json().catch(() => ({}));
    const client = createBrainClient();
    
    const action = body.action || 'upcoming';
    const days = body.days || 7;
    
    // Get access token
    const accessToken = await getAccessToken();
    
    let result: any;
    
    if (action === 'create' && body.event) {
      const trace = createTrace('AIR', 'RADAR', 'GOOGLE', `Creating event: ${body.event.title}`, 'CREATING');
      
      const created = await createEvent(accessToken, body.event);
      
      await logTrace({ ...trace, result: 'Event created' });
      
      result = {
        agent: 'Realtime Autonomous Data and Activity Recorder (RADAR)',
        status: 'complete',
        action: 'create',
        event: created
      };
      
    } else {
      const trace = createTrace('CRON', 'RADAR', 'GOOGLE', `Fetching ${days} days of events`, 'FETCHING');
      
      const events = await getUpcomingEvents(accessToken, days);
      const conflicts = checkForConflicts(events);
      const upcoming = await checkUpcomingMeetings(events);
      
      // Alert for upcoming meetings
      for (const meeting of upcoming) {
        await fetch(`${REACH_URL}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: BRANDON_PHONE,
            message: `⏰ MEETING IN 15 MIN: ${meeting.summary}`
          })
        });
        
        createTrace('RADAR', 'REACH', 'SMS', `Reminder: ${meeting.summary}`, 'SENT');
      }
      
      // Store in brain
      if (events.length > 0) {
        await brainWrite(client, {
          content: `RADAR SCAN [${new Date().toISOString()}]: ${events.length} events, ${conflicts.length} conflicts, ${upcoming.length} starting soon`,
          memory_type: 'system',
          categories: ['radar', 'calendar'],
          importance: 4,
          is_system: true,
          source: `radar_scan_${Date.now()}`,
          tags: ['radar', 'calendar', 'scan']
        });
      }
      
      await logTrace({ ...trace, result: `${events.length} events, ${conflicts.length} conflicts` });
      
      result = {
        agent: 'Realtime Autonomous Data and Activity Recorder (RADAR)',
        status: 'complete',
        action: 'upcoming',
        eventCount: events.length,
        conflictCount: conflicts.length,
        upcomingCount: upcoming.length,
        conflicts,
        events: events.slice(0, 10).map(e => ({
          id: e.id,
          title: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date
        }))
      };
    }
    
    await reportToAIR('RADAR', 'complete', result);
    
    // We Are All ABA.
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorResult = {
      agent: 'Realtime Autonomous Data and Activity Recorder (RADAR)',
      status: 'error',
      error: error.message
    };
    
    await reportToAIR('RADAR', 'error', errorResult);
    
    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// We Are All ABA.
