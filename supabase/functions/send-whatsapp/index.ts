import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface WhatsAppRequest {
  to: string;
  message: string;
  messageType: 'weekly_task' | 'emergency_assignment' | 'general';
  relatedId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { to, message, messageType, relatedId }: WhatsAppRequest = await req.json();
    console.log('Sending WhatsApp message to:', to);
    
    // Create notification record first
    const { data: notification, error: notificationError } = await supabase.from('whatsapp_notifications').insert({
      recipient_phone: to,
      message_content: message,
      message_type: messageType,
      related_id: relatedId,
      status: 'pending'
    }).select().single();
    
    if (notificationError) {
      console.error('Error creating notification record:', notificationError);
      throw notificationError;
    }
    
    // Send WhatsApp message via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
    
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Missing Twilio credentials');
    }
    
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const formData = new URLSearchParams();
    formData.append('From', `whatsapp:${fromNumber}`);
    formData.append('To', `whatsapp:${to}`);
    formData.append('Body', message);
    
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    const twilioResult = await twilioResponse.json();
    
    if (twilioResponse.ok) {
      // Update notification record with success
      await supabase.from('whatsapp_notifications').update({
        status: 'sent',
        twilio_sid: twilioResult.sid,
        sent_at: new Date().toISOString()
      }).eq('id', notification.id);
      
      console.log('WhatsApp message sent successfully:', twilioResult.sid);
      return new Response(JSON.stringify({
        success: true,
        sid: twilioResult.sid
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } else {
      // Update notification record with error
      await supabase.from('whatsapp_notifications').update({
        status: 'failed',
        error_message: twilioResult.message || 'Unknown error'
      }).eq('id', notification.id);
      
      console.error('Twilio error:', twilioResult);
      throw new Error(twilioResult.message || 'Failed to send WhatsApp message');
    }
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error in send-whatsapp function:', message);
    return new Response(JSON.stringify({
      error: message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
});
