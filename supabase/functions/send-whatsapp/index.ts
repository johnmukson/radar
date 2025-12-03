// ============================================================================
// WhatsApp Notification Edge Function
// Function: send-whatsapp
// Description: Sends WhatsApp messages via Twilio WhatsApp API
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WhatsAppRequest {
  notification_id?: string; // Optional: specific notification ID to send
  to?: string; // Optional: direct send (for backwards compatibility)
  message?: string; // Optional: direct send
  messageType?: string; // Optional: direct send
  relatedId?: string; // Optional: direct send
  process_pending?: boolean; // Process pending notifications
}

interface WhatsAppNotification {
  id: string;
  user_id: string;
  branch_id: string;
  recipient_phone: string;
  message_content: string;
  message_type: string;
  related_id: string | null;
  related_type: string | null;
  metadata: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.log('Send WhatsApp function called:', {
    method: req.method,
    url: req.url
  })

  try {
    // Validate required environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Missing required environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Twilio credentials
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER') // Format: +14155552671 (no whatsapp: prefix)

    if (!accountSid || !authToken || !fromNumber) {
      console.error('Missing Twilio credentials')
      return new Response(
        JSON.stringify({ 
          error: 'Missing Twilio credentials',
          details: 'Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER environment variables.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const requestBody: WhatsAppRequest = await req.json()
    const results: Array<{ id: string; success: boolean; sid?: string; error?: string }> = []

    // Process pending notifications
    if (requestBody.process_pending !== false) {
      // Get pending notifications
      const { data: pendingNotifications, error: fetchError } = await supabase.rpc(
        'get_pending_whatsapp_notifications',
        { p_limit: 50 }
      )

      if (fetchError) {
        console.error('Error fetching pending notifications:', fetchError)
        throw fetchError
      }

      if (pendingNotifications && pendingNotifications.length > 0) {
        console.log(`Processing ${pendingNotifications.length} pending notifications`)

        // Process each notification
        for (const notification of pendingNotifications as WhatsAppNotification[]) {
          try {
            const result = await sendWhatsAppMessage(
              supabase,
              accountSid,
              authToken,
              fromNumber,
              notification
            )
            results.push(result)
          } catch (error: any) {
            console.error(`Error processing notification ${notification.id}:`, error)
            results.push({
              id: notification.id,
              success: false,
              error: error.message || 'Unknown error'
            })

            // Update notification status to failed
            await supabase.rpc('update_whatsapp_notification_status', {
              p_notification_id: notification.id,
              p_status: 'failed',
              p_error_message: error.message || 'Unknown error'
            })
          }
        }
      }
    }

    // Handle direct send (backwards compatibility)
    if (requestBody.to && requestBody.message) {
      const notification = {
        id: requestBody.notification_id || crypto.randomUUID(),
        user_id: '',
        branch_id: '',
        recipient_phone: requestBody.to,
        message_content: requestBody.message,
        message_type: requestBody.messageType || 'custom',
        related_id: requestBody.relatedId || null,
        related_type: null,
        metadata: {}
      } as WhatsAppNotification

      try {
        // Create notification record first
        const { data: createdNotification, error: createError } = await supabase
          .from('whatsapp_notification_queue')
          .insert({
            recipient_phone: requestBody.to,
            message_content: requestBody.message,
            message_type: requestBody.messageType || 'custom',
            related_id: requestBody.relatedId || null,
            status: 'pending'
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating notification record:', createError)
          // Continue with send anyway
        } else {
          notification.id = createdNotification.id
          notification.user_id = createdNotification.user_id || ''
          notification.branch_id = createdNotification.branch_id || ''
        }

        const result = await sendWhatsAppMessage(
          supabase,
          accountSid,
          authToken,
          fromNumber,
          notification
        )
        results.push(result)
      } catch (error: any) {
        console.error('Error in direct send:', error)
        results.push({
          id: notification.id,
          success: false,
          error: error.message || 'Unknown error'
        })
      }
    }

    // Handle specific notification ID
    if (requestBody.notification_id && !requestBody.to) {
      const { data: notification, error: fetchError } = await supabase
        .from('whatsapp_notification_queue')
        .select('*')
        .eq('id', requestBody.notification_id)
        .eq('status', 'pending')
        .single()

      if (fetchError || !notification) {
        throw new Error(`Notification ${requestBody.notification_id} not found or not pending`)
      }

      const result = await sendWhatsAppMessage(
        supabase,
        accountSid,
        authToken,
        fromNumber,
        notification as WhatsAppNotification
      )
      results.push(result)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results: results
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 200,
      }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('Error in send-whatsapp function:', errorMessage)
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Unknown'
    })
    
    const errorResponse = new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorMessage
      }),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        status: 500,
      }
    )
    
    console.log('Returning error response to client')
    return errorResponse
  }
})

/**
 * Send WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(
  supabase: any,
  accountSid: string,
  authToken: string,
  fromNumber: string,
  notification: WhatsAppNotification
): Promise<{ id: string; success: boolean; sid?: string; error?: string }> {
  // Ensure phone number has country code and whatsapp: prefix
  let toNumber = notification.recipient_phone.trim()
  if (!toNumber.startsWith('whatsapp:')) {
    // Add whatsapp: prefix if not present
    if (!toNumber.startsWith('+')) {
      // Assume default country code if not provided (you may want to handle this differently)
      toNumber = '+1' + toNumber.replace(/\D/g, '')
    }
    toNumber = `whatsapp:${toNumber}`
  }

  // Ensure from number has whatsapp: prefix
  let fromWhatsApp = fromNumber.trim()
  if (!fromWhatsApp.startsWith('whatsapp:')) {
    fromWhatsApp = `whatsapp:${fromWhatsApp}`
  }

  // Twilio API endpoint
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  
  // Prepare form data
  const formData = new URLSearchParams()
  formData.append('From', fromWhatsApp)
  formData.append('To', toNumber)
  formData.append('Body', notification.message_content)

  console.log(`Sending WhatsApp message to ${toNumber} from ${fromWhatsApp}`)

  // Send request to Twilio with timeout (20 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  let twilioResponse: Response
  try {
    twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString(),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
  } catch (fetchError: any) {
    clearTimeout(timeoutId)
    if (fetchError.name === 'AbortError') {
      const errorMsg = 'Twilio API request timed out after 20 seconds'
      console.error(errorMsg)
      await supabase.rpc('update_whatsapp_notification_status', {
        p_notification_id: notification.id,
        p_status: 'failed',
        p_error_message: errorMsg
      })
      throw new Error(errorMsg)
    }
    throw fetchError
  }

  const twilioResult = await twilioResponse.json()

  if (twilioResponse.ok && twilioResult.sid) {
    // Update notification status to sent
    await supabase.rpc('update_whatsapp_notification_status', {
      p_notification_id: notification.id,
      p_status: 'sent',
      p_twilio_sid: twilioResult.sid
    })

    console.log(`WhatsApp message sent successfully: ${twilioResult.sid}`)
    
    return {
      id: notification.id,
      success: true,
      sid: twilioResult.sid
    }
  } else {
    // Update notification status to failed
    const errorMsg = twilioResult.message || twilioResult.error || 'Unknown Twilio error'
    await supabase.rpc('update_whatsapp_notification_status', {
      p_notification_id: notification.id,
      p_status: 'failed',
      p_error_message: errorMsg
    })

    console.error('Twilio error:', twilioResult)
    throw new Error(errorMsg)
  }
}
