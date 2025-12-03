import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

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

  // Add timeout for database operations (10 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`DB upsert error: ${response.status} ${text}`)
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId)
    if (fetchError.name === 'AbortError') {
      throw new Error('Database operation timed out after 10 seconds')
    }
    throw fetchError
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const form = await req.formData()
    const rawPayload = Object.fromEntries(form.entries())
    const messageSid = (form.get('MessageSid') || form.get('SmsSid') || '') as string

    if (!messageSid) {
      return new Response('Missing MessageSid', {
        status: 400,
        headers: corsHeaders,
      })
    }

    const mediaCount = Number(form.get('NumMedia') ?? '0')
    const timestamp =
      (form.get('Timestamp') as string | null) ||
      (form.get('SmsTimestamp') as string | null) ||
      undefined

    const data = {
      message_sid: messageSid,
      direction: (form.get('Direction') as string | null) ?? 'inbound',
      from_number: (form.get('From') || '') as string,
      to_number: (form.get('To') || '') as string,
      body: (form.get('Body') || '') as string,
      media_count: Number.isNaN(mediaCount) ? 0 : mediaCount,
      whatsapp_profile_name: (form.get('ProfileName') || '') as string,
      wa_id: (form.get('WaId') || '') as string,
      status: null,
      error_code: null,
      error_message: null,
      event_type: 'message',
      raw_payload: rawPayload,
      twilio_timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
    }

    await upsert(data)

    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('whatsapp-webhook error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error details:', {
      message: errorMessage,
      name: error instanceof Error ? error.name : 'Unknown'
    })
    return new Response(
      JSON.stringify({ error: 'Webhook error', details: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})