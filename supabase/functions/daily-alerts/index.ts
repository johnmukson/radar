import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserAlert {
  user_id: string
  user_email: string
  user_name: string
  user_phone: string | null
  roles: string[]
  branch_ids: string[]
  alerts: string[]
  priority: 'low' | 'medium' | 'high' | 'critical'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('Daily alerts function called:', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  })

  try {
    // Validate required environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing required environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Missing required environment variables (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get all active users with their roles and branches
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        phone,
        status,
        user_roles (
          role,
          branch_id,
          branch:branches (
            id,
            name,
            code
          )
        )
      `)
      .eq('status', 'active')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      throw usersError
    }

    if (!users || users.length === 0) {
      console.log('No active users found')
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No active users to send alerts to',
          alerts_sent: 0
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing alerts for ${users.length} users`)

    const userAlerts: UserAlert[] = []
    const alertsSent: Array<{ user_id: string; method: string; success: boolean }> = []

    // Process each user and generate role-based alerts
    for (const user of users) {
      if (!user.user_roles || user.user_roles.length === 0) {
        continue // Skip users without roles
      }

      const roles = user.user_roles.map((ur: any) => ur.role)
      const branchIds = user.user_roles
        .filter((ur: any) => ur.branch_id)
        .map((ur: any) => ur.branch_id)
      
      const branches = user.user_roles
        .filter((ur: any) => ur.branch)
        .map((ur: any) => ur.branch)

      const alerts: string[] = []
      let priority: 'low' | 'medium' | 'high' | 'critical' = 'low'

      // Generate role-based alerts
      for (const branch of branches) {
        const branchId = branch.id

        // 1. Expiring items (30 days) - All roles
        const { data: expiringItems } = await supabaseAdmin
          .from('stock_items')
          .select('id, product_name, expiry_date, quantity, unit_price, days_to_expiry')
          .eq('branch_id', branchId)
          .eq('status', 'active')
          .gte('expiry_date', new Date().toISOString().split('T')[0])
          .lte('expiry_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .limit(10)

        if (expiringItems && expiringItems.length > 0) {
          const totalValue = expiringItems.reduce((sum, item) => 
            sum + (item.quantity * (item.unit_price || 0)), 0
          )
          alerts.push(
            `⚠️ ${branch.name}: ${expiringItems.length} items expiring within 30 days (Value: $${totalValue.toFixed(2)})`
          )
          if (expiringItems.length > 20 || totalValue > 20000) {
            priority = priority === 'low' ? 'high' : priority === 'medium' ? 'high' : 'critical'
          } else if (expiringItems.length > 10) {
            priority = priority === 'low' ? 'medium' : priority
          }
        }

        // 2. Low stock alerts - Managers and Admins
        if (roles.some((r: string) => ['system_admin', 'branch_system_admin', 'branch_manager', 'admin', 'regional_manager'].includes(r))) {
          const { data: lowStockItems } = await supabaseAdmin
            .from('stock_items')
            .select('id, product_name, quantity')
            .eq('branch_id', branchId)
            .eq('status', 'active')
            .lt('quantity', 10)
            .limit(10)

          if (lowStockItems && lowStockItems.length > 0) {
            alerts.push(`📦 ${branch.name}: ${lowStockItems.length} items running low (< 10 units)`)
            if (lowStockItems.length > 15) {
              priority = priority === 'low' ? 'medium' : priority === 'medium' ? 'high' : priority
            }
          }
        }

        // 3. Pending emergencies - All roles
        const { data: emergencies } = await supabaseAdmin
          .from('emergency_assignments')
          .select('id, deadline, stock_item_id')
          .eq('branch_id', branchId)
          .eq('status', 'pending')
          .limit(5)

        if (emergencies && emergencies.length > 0) {
          alerts.push(`🚨 ${branch.name}: ${emergencies.length} pending emergency assignment(s)`)
          priority = 'high'
        }

        // 4. Pending weekly tasks - Dispensers and Doctors
        if (roles.some((r: string) => ['dispenser', 'doctor'].includes(r))) {
          const { data: pendingTasks } = await supabaseAdmin
            .from('weekly_tasks')
            .select('id, task_type, deadline')
            .eq('branch_id', branchId)
            .eq('status', 'pending')
            .limit(5)

          if (pendingTasks && pendingTasks.length > 0) {
            alerts.push(`📋 ${branch.name}: ${pendingTasks.length} pending task(s)`)
            if (priority === 'low') priority = 'medium'
          }
        }

        // 5. High-value items - System Admins and Regional Managers
        if (roles.some((r: string) => ['system_admin', 'regional_manager'].includes(r))) {
          const { data: highValueItems } = await supabaseAdmin
            .from('stock_items')
            .select('id, product_name, quantity, unit_price')
            .eq('branch_id', branchId)
            .eq('status', 'active')
            .limit(100)

          if (highValueItems) {
            const highValue = highValueItems.filter(item => 
              (item.quantity * (item.unit_price || 0)) > 10000
            )
            if (highValue.length > 0) {
              const totalValue = highValue.reduce((sum, item) => 
                sum + (item.quantity * (item.unit_price || 0)), 0
              )
              alerts.push(`💰 ${branch.name}: ${highValue.length} high-value items (Total: $${totalValue.toFixed(2)})`)
            }
          }
        }

        // 6. New AI recommendations - Managers and Admins
        if (roles.some((r: string) => ['system_admin', 'branch_system_admin', 'branch_manager', 'admin', 'regional_manager'].includes(r))) {
          const { data: newRecommendations } = await supabaseAdmin
            .from('ai_recommendations')
            .select('id, title, priority, recommendation_type')
            .eq('branch_id', branchId)
            .eq('status', 'pending')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(5)

          if (newRecommendations && newRecommendations.length > 0) {
            const criticalCount = newRecommendations.filter(r => r.priority === 'critical').length
            alerts.push(`🤖 ${branch.name}: ${newRecommendations.length} new AI recommendation(s)${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}`)
            if (criticalCount > 0) {
              priority = 'high'
            }
          }
        }
      }

      if (alerts.length > 0) {
        userAlerts.push({
          user_id: user.id,
          user_email: user.email,
          user_name: user.name || user.email,
          user_phone: user.phone,
          roles,
          branch_ids: branchIds,
          alerts,
          priority
        })
      }
    }

    console.log(`Generated ${userAlerts.length} user alerts`)

    // Send alerts via WhatsApp (if phone available) or store for in-app notification
    for (const userAlert of userAlerts) {
      const alertMessage = `🌅 Daily Inventory Alert - ${new Date().toLocaleDateString()}\n\n` +
        `Hello ${userAlert.user_name},\n\n` +
        `Here's your daily summary:\n\n` +
        userAlert.alerts.join('\n\n') +
        `\n\nView details: ${supabaseUrl.replace('/rest/v1', '')}/dashboard`

      // Send via WhatsApp if phone number is available
      if (userAlert.user_phone) {
        try {
          // Queue WhatsApp notification
          const { error: whatsappError } = await supabaseAdmin
            .from('whatsapp_notifications')
            .insert({
              user_id: userAlert.user_id,
              branch_id: userAlert.branch_ids[0] || null,
              recipient_phone: userAlert.user_phone,
              message_content: alertMessage,
              message_type: 'daily_alert',
              related_type: 'daily_summary',
              metadata: {
                priority: userAlert.priority,
                alert_count: userAlert.alerts.length,
                roles: userAlert.roles
              }
            })

          if (whatsappError) {
            console.error(`Error queuing WhatsApp for user ${userAlert.user_id}:`, whatsappError)
          } else {
            alertsSent.push({ user_id: userAlert.user_id, method: 'whatsapp', success: true })
            console.log(`Queued WhatsApp alert for user ${userAlert.user_email}`)
          }
        } catch (error) {
          console.error(`Error sending WhatsApp to user ${userAlert.user_id}:`, error)
          alertsSent.push({ user_id: userAlert.user_id, method: 'whatsapp', success: false })
        }
      }

      // Also create in-app notification record
      try {
        const { error: notificationError } = await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: userAlert.user_id,
            message: `Daily Alert (${userAlert.priority.toUpperCase()} Priority):\n\n${userAlert.alerts.join('\n\n')}`,
            type: 'daily_alert',
            is_read: false
          })
          .select()
          .single()

        if (notificationError) {
          console.error(`Error creating notification for user ${userAlert.user_id}:`, notificationError)
        } else {
          if (!userAlert.user_phone) {
            alertsSent.push({ user_id: userAlert.user_id, method: 'in_app', success: true })
          }
        }
      } catch (error) {
        console.error(`Error creating in-app notification for user ${userAlert.user_id}:`, error)
      }
    }

    // Trigger WhatsApp sending for queued messages (async, don't wait)
    // Note: WhatsApp messages will be sent by the scheduled send-whatsapp job
    console.log('WhatsApp notifications queued, will be sent by scheduled job')

    const response = new Response(
      JSON.stringify({
        success: true,
        message: 'Daily alerts processed',
        users_processed: users.length,
        alerts_generated: userAlerts.length,
        alerts_sent: alertsSent.length,
        details: alertsSent
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

    console.log('Daily alerts function completed successfully')
    return response

  } catch (error) {
    console.error('Unexpected error in daily alerts:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Unknown'
    })
    
    const errorResponse = new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
    console.log('Returning error response')
    return errorResponse
  }
})

