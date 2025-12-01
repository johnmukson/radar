import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function upsert(payload: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error('Supabase environment variables are not configured')
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`DB upsert error: ${response.status} ${text}`)
  }
}

function mapStatus(status: string) {
  switch (status.toLowerCase()) {
    case 'queued':
    case 'sending':
    case 'sent':
      return 'sent'
    case 'delivered':
      return 'delivered'
    case 'read':
      return 'read'
    case 'failed':
    case 'undelivered':
    case 'canceled':
    case 'cancelled':
      return 'failed'
    default:
      return 'sent'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error('Supabase environment variables are not configured')
    }

    const form = await req.formData()
    const rawPayload = Object.fromEntries(form.entries())
    const messageSid = (form.get('MessageSid') || '') as string

    if (!messageSid) {
      return new Response('Missing MessageSid', {
        status: 400,
        headers: corsHeaders,
      })
    }

    const messageStatus = ((form.get('MessageStatus') || '') as string).toLowerCase()

    const data = {
      message_sid: messageSid,
      direction: 'outbound',
      to_number: (form.get('To') || '') as string,
      from_number: (form.get('From') || '') as string,
      status: messageStatus || null,
      error_code: (form.get('ErrorCode') || '') as string,
      error_message: (form.get('ErrorMessage') || '') as string,
      event_type: 'status_update',
      raw_payload,
      twilio_timestamp: new Date().toISOString(),
    }

    await upsert(data)

    // Update the queue table to reflect delivery progress when possible
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const normalizedStatus = mapStatus(messageStatus)
    const queueUpdate: Record<string, unknown> = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    }

    if (normalizedStatus === 'sent') {
      queueUpdate['sent_at'] = new Date().toISOString()
    }
    if (normalizedStatus === 'delivered') {
      const now = new Date().toISOString()
      queueUpdate['delivered_at'] = now
      if (!queueUpdate['sent_at']) {
        queueUpdate['sent_at'] = now
      }
    }
    if (normalizedStatus === 'read') {
      const now = new Date().toISOString()
      queueUpdate['read_at'] = now
      queueUpdate['delivered_at'] = queueUpdate['delivered_at'] ?? now
      queueUpdate['sent_at'] = queueUpdate['sent_at'] ?? now
    }
    if (normalizedStatus === 'failed') {
      queueUpdate['error_message'] = data.error_message || `Message status: ${messageStatus}`
    }

    const { error: updateError } = await supabase
      .from('whatsapp_notification_queue')
      .update(queueUpdate)
      .eq('twilio_sid', messageSid)

    if (updateError) {
      console.error('Failed to update whatsapp_notification_queue:', updateError)
    }

    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('whatsapp-status error:', error)
    return new Response('Status error', {
      status: 500,
      headers: corsHeaders,
    })
  }
})

