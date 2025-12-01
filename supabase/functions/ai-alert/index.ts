import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user has appropriate role (regional_manager or system_admin)
    const { data: userRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['system_admin', 'regional_manager'])

    if (roleError || !userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Only regional managers and system admins can request AI recommendations.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get stock items that are expiring soon or need attention
    const { data: stockItems, error: stockError } = await supabaseAdmin
      .from('stock_items')
      .select('id, product_name, expiry_date, quantity, unit_price, days_to_expiry, risk_level, branch_id')
      .order('expiry_date', { ascending: true })
      .limit(50)

    if (stockError) {
      console.error('Error fetching stock items:', stockError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stock data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get emergency assignments
    const { data: emergencies, error: emergencyError } = await supabaseAdmin
      .from('emergency_assignments')
      .select('id, status, deadline, stock_item_id')
      .eq('status', 'pending')
      .order('deadline', { ascending: true })
      .limit(20)

    // Analyze data
    const criticalItems = stockItems?.filter(item => {
      const daysToExpiry = item.days_to_expiry || 
        Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysToExpiry <= 30 && daysToExpiry >= 0
    }) || []

    const expiredItems = stockItems?.filter(item => {
      const daysToExpiry = item.days_to_expiry || 
        Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return daysToExpiry < 0
    }) || []

    const highValueItems = stockItems?.filter(item => {
      const value = (item.quantity || 0) * (item.unit_price || 0)
      return value >= 100000
    }) || []

    // Generate recommendation using OpenAI API if available, otherwise use rule-based
    let recommendation = ''
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (openaiApiKey) {
      try {
        // Prepare data summary for OpenAI
        const dataSummary = {
          totalItems: stockItems?.length || 0,
          criticalItems: criticalItems.length,
          expiredItems: expiredItems.length,
          highValueItems: highValueItems.length,
          pendingEmergencies: emergencies?.length || 0,
          sampleCritical: criticalItems.slice(0, 10).map(item => ({
            name: item.product_name,
            daysToExpiry: item.days_to_expiry || Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
            quantity: item.quantity,
            value: (item.quantity || 0) * (item.unit_price || 0)
          })),
          sampleExpired: expiredItems.slice(0, 10).map(item => ({
            name: item.product_name,
            quantity: item.quantity,
            value: (item.quantity || 0) * (item.unit_price || 0)
          })),
          sampleHighValue: highValueItems.slice(0, 10).map(item => ({
            name: item.product_name,
            quantity: item.quantity,
            value: (item.quantity || 0) * (item.unit_price || 0)
          }))
        }

        // Call OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an expert inventory management advisor for a pharmaceutical/medical supply company with multiple branches. Provide clear, actionable recommendations based on stock data. Use emojis appropriately and format responses in a professional, easy-to-read manner.'
              },
              {
                role: 'user',
                content: `Analyze this stock management data and provide comprehensive recommendations:

Total Stock Items: ${dataSummary.totalItems}
Critical Items (expiring within 30 days): ${dataSummary.criticalItems}
Expired Items: ${dataSummary.expiredItems}
High Value Items: ${dataSummary.highValueItems}
Pending Emergency Assignments: ${dataSummary.pendingEmergencies}

Critical Items Sample:
${JSON.stringify(dataSummary.sampleCritical, null, 2)}

Expired Items Sample:
${JSON.stringify(dataSummary.sampleExpired, null, 2)}

High Value Items Sample:
${JSON.stringify(dataSummary.sampleHighValue, null, 2)}

Please provide:
1. A clear summary of the current stock situation
2. Prioritized action items
3. Specific recommendations for each category (expired, critical, high-value)
4. Best practices for preventing future issues
5. Estimated impact/value of recommendations

Format the response with clear sections, use emojis for visual clarity, and make it actionable.`
              }
            ],
            temperature: 0.7,
            max_tokens: 1500
          })
        })

        if (openaiResponse.ok) {
          const openaiData = await openaiResponse.json()
          recommendation = openaiData.choices[0]?.message?.content || ''
        } else {
          console.error('OpenAI API error:', await openaiResponse.text())
          // Fall through to rule-based generation
        }
      } catch (error) {
        console.error('Error calling OpenAI API:', error)
        // Fall through to rule-based generation
      }
    }

    // Fallback to rule-based recommendations if OpenAI fails or is not configured
    if (!recommendation) {
      recommendation = '📊 AI Stock Management Recommendations:\n\n'

      if (expiredItems.length > 0) {
        recommendation += `🚨 URGENT: ${expiredItems.length} item(s) have expired and need immediate disposal:\n`
        expiredItems.slice(0, 5).forEach(item => {
          recommendation += `   • ${item.product_name} (Expired)\n`
        })
        recommendation += '\n'
      }

      if (criticalItems.length > 0) {
        recommendation += `⚠️ CRITICAL: ${criticalItems.length} item(s) expiring within 30 days:\n`
        criticalItems.slice(0, 5).forEach(item => {
          const days = item.days_to_expiry || 
            Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          recommendation += `   • ${item.product_name} (${days} days remaining)\n`
        })
        recommendation += '\n'
      }

      if (emergencies && emergencies.length > 0) {
        recommendation += `📋 PENDING: ${emergencies.length} emergency assignment(s) requiring attention:\n`
        recommendation += `   Review and prioritize these assignments.\n\n`
      }

      if (highValueItems.length > 0) {
        recommendation += `💰 HIGH VALUE: ${highValueItems.length} high-value item(s) detected:\n`
        highValueItems.slice(0, 3).forEach(item => {
          const value = (item.quantity || 0) * (item.unit_price || 0)
          recommendation += `   • ${item.product_name} (Value: $${value.toLocaleString()})\n`
        })
        recommendation += '\n'
      }

      if (criticalItems.length === 0 && expiredItems.length === 0 && (!emergencies || emergencies.length === 0)) {
        recommendation += '✅ All stock levels are healthy. No immediate actions required.\n'
      }

      recommendation += '\n💡 Recommendations:\n'
      if (expiredItems.length > 0) {
        recommendation += '1. Dispose of expired items immediately\n'
      }
      if (criticalItems.length > 0) {
        recommendation += '2. Prioritize distribution of items expiring soon\n'
      }
      if (emergencies && emergencies.length > 0) {
        recommendation += '3. Review and complete pending emergency assignments\n'
      }
      if (highValueItems.length > 0) {
        recommendation += '4. Monitor high-value items closely\n'
      }
    }

    // Store recommendation in database
    const { error: insertError } = await supabaseAdmin
      .from('ai_recommendations')
      .insert({
        dispenser_id: user.id,
        recommendation: recommendation
      })

    if (insertError) {
      console.error('Error storing recommendation:', insertError)
      // Continue even if storage fails
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        recommendation: recommendation,
        stats: {
          totalItems: stockItems?.length || 0,
          criticalItems: criticalItems.length,
          expiredItems: expiredItems.length,
          highValueItems: highValueItems.length,
          pendingEmergencies: emergencies?.length || 0
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

