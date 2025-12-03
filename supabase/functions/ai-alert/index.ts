import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Recommendation {
  branch_id: string | null
  recommendation_type: string
  title: string
  recommendation: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  impact_score: number
  metadata: Record<string, any>
  estimated_savings?: number
  related_stock_items?: string[]
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('AI Alert function called:', {
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.get('Authorization')
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

    // Create Supabase client with service role key (bypasses RLS)
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

    // Check if user has appropriate role (regional_manager, system_admin, or branch_system_admin)
    const { data: userRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, branch_id')
      .eq('user_id', user.id)
      .in('role', ['system_admin', 'regional_manager', 'branch_system_admin', 'branch_manager'])

    if (roleError || !userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Only managers and admins can request AI recommendations.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body for branch_id and recommendation_type
    let requestBody: { branch_id?: string; recommendation_type?: string } = {}
    try {
      const bodyText = await req.text()
      if (bodyText) {
        requestBody = JSON.parse(bodyText)
      }
    } catch {
      // Body is optional, continue with defaults
    }

    const requestedBranchId = requestBody.branch_id || null
    const requestedType = requestBody.recommendation_type || null

    // Determine which branches to analyze
    let branchIds: string[] = []
    if (requestedBranchId) {
      // Check if user has access to this branch
      const hasAccess = userRoles.some(ur => 
        ur.role === 'system_admin' || 
        ur.role === 'regional_manager' ||
        ur.branch_id === requestedBranchId
      )
      if (hasAccess) {
        branchIds = [requestedBranchId]
      } else {
        return new Response(
          JSON.stringify({ error: 'You do not have access to this branch' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Get all branches user has access to
      if (userRoles.some(ur => ur.role === 'system_admin' || ur.role === 'regional_manager')) {
        // System admin or regional manager can see all branches
        const { data: allBranches } = await supabaseAdmin
          .from('branches')
          .select('id')
        branchIds = allBranches?.map(b => b.id) || []
      } else {
        // Branch managers can only see their branches
        branchIds = userRoles.map(ur => ur.branch_id).filter((id): id is string => id !== null)
      }
    }

    if (branchIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No accessible branches found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const recommendations: Recommendation[] = []
    let allStockItems: any[] = []
    let allEmergencies: any[] = []

    // Analyze each branch
    for (const branchId of branchIds) {
      // 1. Get comprehensive stock data for this branch
      const { data: stockItems, error: stockError } = await supabaseAdmin
        .from('stock_items')
        .select('id, product_name, expiry_date, quantity, unit_price, days_to_expiry, risk_level, branch_id, status, is_high_value, value, priority, priority_score')
        .eq('branch_id', branchId)
        .eq('status', 'active')
        .order('expiry_date', { ascending: true })

      if (stockError) {
        console.error(`Error fetching stock items for branch ${branchId}:`, stockError)
        continue
      }

      allStockItems.push(...(stockItems || []))

      // 2. Get emergency assignments
    const { data: emergencies, error: emergencyError } = await supabaseAdmin
      .from('emergency_assignments')
        .select('id, status, deadline, stock_item_id, assigned_quantity')
      .eq('status', 'pending')
      .order('deadline', { ascending: true })

      if (!emergencyError && emergencies) {
        allEmergencies.push(...emergencies)
      }

      // 3. Get dormant stock data
      const { data: dormantStock, error: dormantError } = await supabaseAdmin
        .from('dormant_stock')
        .select('id, product_name, excess_value, excess_qty, days, sales')
        .eq('branch_id', branchId)
        .limit(50)

      // 4. Get weekly tasks
      const { data: weeklyTasks, error: tasksError } = await supabaseAdmin
        .from('weekly_tasks')
        .select('id, product_name, expiry_date, risk_level, quantity, task_date, status')
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .limit(50)

      // 5. Get branch information
      const { data: branchInfo } = await supabaseAdmin
        .from('branches')
        .select('id, name, code, region')
        .eq('id', branchId)
        .single()

      // Use AI to generate recommendations directly from data (primary method)
      const groqApiKey = Deno.env.get('GROQ_API_KEY')
      const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
      
      if (groqApiKey || openaiApiKey) {
        try {
          console.log('Generating AI-powered recommendations for branch:', branchId)
          // Generate AI recommendations directly
          const aiRecommendations = await generateAIRecommendations(
            stockItems || [],
            emergencies || [],
            dormantStock || [],
            weeklyTasks || [],
            branchInfo,
            requestedType,
            groqApiKey,
            openaiApiKey
          )
          
          if (aiRecommendations && aiRecommendations.length > 0) {
            recommendations.push(...aiRecommendations)
            console.log(`Generated ${aiRecommendations.length} AI recommendations`)
          } else {
            console.log('AI did not generate recommendations, falling back to rule-based')
            // Fallback to rule-based if AI fails
            const analysis = analyzeStockData(
              stockItems || [],
              emergencies || [],
              dormantStock || [],
              weeklyTasks || [],
              branchInfo
            )
            const branchRecommendations = generateRecommendations(analysis, branchId, requestedType)
            recommendations.push(...branchRecommendations)
          }
        } catch (aiError) {
          console.error('Error generating AI recommendations, falling back to rule-based:', aiError)
          // Fallback to rule-based recommendations
          const analysis = analyzeStockData(
            stockItems || [],
            emergencies || [],
            dormantStock || [],
            weeklyTasks || [],
            branchInfo
          )
          const branchRecommendations = generateRecommendations(analysis, branchId, requestedType)
          recommendations.push(...branchRecommendations)
        }
      } else {
        // No AI keys available, use rule-based
        console.log('No AI API keys available, using rule-based recommendations')
        const analysis = analyzeStockData(
          stockItems || [],
          emergencies || [],
          dormantStock || [],
          weeklyTasks || [],
          branchInfo
        )
        const branchRecommendations = generateRecommendations(analysis, branchId, requestedType)
        recommendations.push(...branchRecommendations)
      }
    }

    // Insert recommendations into database
    if (recommendations.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('ai_recommendations')
        .insert(recommendations.map(rec => ({
          branch_id: rec.branch_id,
          recommendation_type: rec.recommendation_type,
          title: rec.title,
          recommendation: rec.recommendation,
          priority: rec.priority,
          status: 'pending',
          metadata: rec.metadata,
          impact_score: rec.impact_score,
          estimated_savings: rec.estimated_savings || null,
          related_stock_items: rec.related_stock_items || null
        })))

    if (insertError) {
        console.error('Error storing recommendations:', insertError)
      // Continue even if storage fails
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        recommendations: recommendations,
        count: recommendations.length,
        stats: {
          branches_analyzed: branchIds.length,
          recommendations_generated: recommendations.length
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
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
    
    console.log('Returning error response to client')
    return errorResponse
  }
})

interface StockAnalysis {
  totalItems: number
  expiring30Days: number
  expiring60To90Days: number
  expiredItems: number
  expiringValue: number
  expiring60To90DaysValue: number
  lowStockCount: number
  highValueItems: number
  highValueTotal: number
  excessStock: number
  veryLowStock: number
  pendingEmergencies: number
  dormantStockValue: number
  pendingTasks: number
  avgExpiryDays: number
  criticalItems: any[]
  expiredItemsList: any[]
  highValueItemsList: any[]
  lowStockItems: any[]
  costReductionItems: any[]
}

function analyzeStockData(
  stockItems: any[],
  emergencies: any[],
  dormantStock: any[],
  weeklyTasks: any[],
  branchInfo: any
): StockAnalysis {
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const criticalItems = stockItems.filter(item => {
    const expiryDate = new Date(item.expiry_date)
    const daysToExpiry = item.days_to_expiry || 
      Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysToExpiry <= 30 && daysToExpiry >= 0 && item.status === 'active'
  })

  const expiredItems = stockItems.filter(item => {
    const expiryDate = new Date(item.expiry_date)
    const daysToExpiry = item.days_to_expiry || 
      Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysToExpiry < 0 && item.status === 'active'
  })

  // Cost reduction: Items expiring in 60-90 days (2-3 months) - enough time to sell/redistribute
  const expiring60To90Days = stockItems.filter(item => {
    const expiryDate = new Date(item.expiry_date)
    const daysToExpiry = item.days_to_expiry || 
      Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysToExpiry >= 60 && daysToExpiry <= 90 && item.status === 'active'
  })

  const lowStockItems = stockItems.filter(item => 
    item.quantity < 10 && item.status === 'active'
  )

  const highValueItems = stockItems.filter(item => {
    const value = (item.quantity || 0) * (item.unit_price || 0)
    return value >= 10000 && item.status === 'active'
  })

  const excessStock = stockItems.filter(item => 
    item.quantity > 100 && item.status === 'active'
  ).length

  const veryLowStock = stockItems.filter(item => 
    item.quantity < 5 && item.status === 'active'
  ).length

  const expiringValue = criticalItems.reduce((sum, item) => 
    sum + ((item.quantity || 0) * (item.unit_price || 0)), 0
  )

  const expiring60To90DaysValue = expiring60To90Days.reduce((sum, item) => 
    sum + ((item.quantity || 0) * (item.unit_price || 0)), 0
  )

  const highValueTotal = highValueItems.reduce((sum, item) => 
    sum + ((item.quantity || 0) * (item.unit_price || 0)), 0
  )

  const dormantStockValue = dormantStock.reduce((sum, item) => 
    sum + (item.excess_value || 0), 0
  )

  const avgExpiryDays = criticalItems.length > 0
    ? Math.round(criticalItems.reduce((sum, item) => 
        sum + (item.days_to_expiry || 0), 0) / criticalItems.length)
    : 0

  return {
    totalItems: stockItems.length,
    expiring30Days: criticalItems.length,
    expiring60To90Days: expiring60To90Days.length,
    expiredItems: expiredItems.length,
    expiringValue,
    expiring60To90DaysValue,
    lowStockCount: lowStockItems.length,
    highValueItems: highValueItems.length,
    highValueTotal,
    excessStock,
    veryLowStock,
    pendingEmergencies: emergencies.length,
    dormantStockValue,
    pendingTasks: weeklyTasks.length,
    avgExpiryDays,
    criticalItems: criticalItems.slice(0, 20),
    expiredItemsList: expiredItems.slice(0, 20),
    highValueItemsList: highValueItems.slice(0, 20),
    lowStockItems: lowStockItems.slice(0, 20),
    costReductionItems: expiring60To90Days.slice(0, 20)
  }
}

function generateRecommendations(
  analysis: StockAnalysis,
  branchId: string,
  requestedType: string | null
): Recommendation[] {
  const recommendations: Recommendation[] = []

  // 1. Expiry Warnings
  if (!requestedType || requestedType === 'expiry_warning') {
    if (analysis.expiring30Days > 0) {
      const priority: 'low' | 'medium' | 'high' | 'critical' = 
        analysis.expiring30Days > 50 || analysis.expiringValue > 50000 ? 'critical' :
        analysis.expiring30Days > 20 || analysis.expiringValue > 20000 ? 'high' :
        analysis.expiring30Days > 10 || analysis.expiringValue > 10000 ? 'medium' : 'low'

      recommendations.push({
        branch_id: branchId,
        recommendation_type: 'expiry_warning',
        title: `Items Expiring Soon: ${analysis.expiring30Days} items expiring within 30 days`,
        recommendation: `You have ${analysis.expiring30Days} items expiring within 30 days with a total value of $${analysis.expiringValue.toFixed(2)}. Consider prioritizing these items for sale or redistribution. Average days until expiry: ${analysis.avgExpiryDays} days.`,
        priority,
        impact_score: Math.min(Math.round(analysis.expiringValue / 1000), 100),
        metadata: {
          expiring_count: analysis.expiring30Days,
          expiring_value: analysis.expiringValue,
          avg_expiry_days: analysis.avgExpiryDays,
          critical_items: analysis.criticalItems.map(item => ({
            id: item.id,
            name: item.product_name,
            days_to_expiry: item.days_to_expiry,
            value: (item.quantity || 0) * (item.unit_price || 0)
          }))
        },
        estimated_savings: analysis.expiringValue,
        related_stock_items: analysis.criticalItems.map(item => item.id)
      })
    }
  }

  // 2. Cost Reduction (60-90 days expiry - proactive planning)
  if (!requestedType || requestedType === 'cost_reduction') {
    if (analysis.expiring60To90Days > 0) {
      const priority: 'low' | 'medium' | 'high' | 'critical' = 
        analysis.expiring60To90DaysValue > 100000 ? 'high' :
        analysis.expiring60To90DaysValue > 50000 ? 'medium' : 'low'

      recommendations.push({
        branch_id: branchId,
        recommendation_type: 'cost_reduction',
        title: `Cost Reduction Opportunity: ${analysis.expiring60To90Days} items expiring in 2-3 months`,
        recommendation: `You have ${analysis.expiring60To90Days} items expiring in 60-90 days with a total value of $${analysis.expiring60To90DaysValue.toFixed(2)}. This timeframe provides an opportunity to proactively sell, redistribute, or negotiate with suppliers to minimize losses. Start planning sales campaigns or inter-branch transfers now.`,
        priority,
        impact_score: Math.min(Math.round(analysis.expiring60To90DaysValue / 2000), 100),
        metadata: {
          expiring_count: analysis.expiring60To90Days,
          potential_loss: analysis.expiring60To90DaysValue,
          days_range: '60-90',
          cost_reduction_items: analysis.costReductionItems.map(item => ({
            id: item.id,
            name: item.product_name,
            days_to_expiry: item.days_to_expiry,
            value: (item.quantity || 0) * (item.unit_price || 0)
          }))
        },
        estimated_savings: analysis.expiring60To90DaysValue * 0.7 // Assume 70% can be saved with proactive action
      })
    }
  }

  // 3. Low Stock Alerts
  if (!requestedType || requestedType === 'low_stock_alert') {
    if (analysis.lowStockCount > 0) {
      const priority: 'low' | 'medium' | 'high' | 'critical' = 
        analysis.lowStockCount > 30 ? 'critical' :
        analysis.lowStockCount > 15 ? 'high' :
        analysis.lowStockCount > 5 ? 'medium' : 'low'

      recommendations.push({
        branch_id: branchId,
        recommendation_type: 'low_stock_alert',
        title: `Low Stock Alert: ${analysis.lowStockCount} items running low`,
        recommendation: `You have ${analysis.lowStockCount} items with quantity below 10 units. Consider reordering these items to prevent stockouts.`,
        priority,
        impact_score: Math.min(Math.round(analysis.lowStockCount / 2), 100),
        metadata: {
          low_stock_count: analysis.lowStockCount,
          low_stock_items: analysis.lowStockItems.map(item => ({
            id: item.id,
            name: item.product_name,
            quantity: item.quantity
          }))
        },
        related_stock_items: analysis.lowStockItems.map(item => item.id)
      })
    }
  }

  // 4. Inventory Analysis (High Value)
  if (!requestedType || requestedType === 'inventory_analysis') {
    if (analysis.highValueItems > 0) {
      const priority: 'low' | 'medium' | 'high' | 'critical' = 
        analysis.highValueTotal > 500000 ? 'critical' :
        analysis.highValueTotal > 200000 ? 'high' : 'medium'

      recommendations.push({
        branch_id: branchId,
        recommendation_type: 'inventory_analysis',
        title: `High Value Inventory: ${analysis.highValueItems} high-value items detected`,
        recommendation: `You have ${analysis.highValueItems} items with individual value exceeding $10,000, totaling $${analysis.highValueTotal.toFixed(2)}. Consider implementing enhanced security measures and regular audits for these high-value items.`,
        priority,
        impact_score: Math.min(Math.round(analysis.highValueTotal / 10000), 100),
        metadata: {
          high_value_count: analysis.highValueItems,
          total_value: analysis.highValueTotal,
          high_value_items: analysis.highValueItemsList.map(item => ({
            id: item.id,
            name: item.product_name,
            value: (item.quantity || 0) * (item.unit_price || 0)
          }))
        },
        related_stock_items: analysis.highValueItemsList.map(item => item.id)
      })
    }
  }

  // 5. Stock Optimization
  if (!requestedType || requestedType === 'stock_optimization') {
    if (analysis.excessStock > 10 || analysis.veryLowStock > 20) {
      const priority: 'low' | 'medium' | 'high' | 'critical' = 
        analysis.excessStock > 30 || analysis.veryLowStock > 50 ? 'high' : 'medium'

      recommendations.push({
        branch_id: branchId,
        recommendation_type: 'stock_optimization',
        title: 'Stock Optimization Needed',
        recommendation: `Your inventory shows ${analysis.excessStock} items with excess stock (>100 units) and ${analysis.veryLowStock} items with very low stock (<5 units). Consider redistributing excess inventory and reordering low stock items for better balance.`,
        priority,
        impact_score: Math.min(Math.round((analysis.excessStock + analysis.veryLowStock) / 5), 100),
        metadata: {
          excess_stock_count: analysis.excessStock,
          very_low_stock_count: analysis.veryLowStock
        }
      })
    }
  }

  // 6. Expired Items Alert
  if (analysis.expiredItems > 0) {
    recommendations.push({
      branch_id: branchId,
      recommendation_type: 'expiry_warning',
      title: `URGENT: ${analysis.expiredItems} expired items need disposal`,
      recommendation: `You have ${analysis.expiredItems} expired items that need immediate disposal. These items should be removed from inventory to prevent accidental use.`,
      priority: 'critical',
      impact_score: 100,
      metadata: {
        expired_count: analysis.expiredItems,
        expired_items: analysis.expiredItemsList.map(item => ({
          id: item.id,
          name: item.product_name,
          expiry_date: item.expiry_date
        }))
      },
      related_stock_items: analysis.expiredItemsList.map(item => item.id)
    })
  }

  return recommendations
}

async function enhanceWithAI(
  recommendations: Recommendation[],
  stockItems: any[],
  emergencies: any[],
  groqApiKey: string | undefined,
  openaiApiKey: string | undefined
): Promise<Array<{ recommendation?: string; metadata?: Record<string, any> }>> {
  try {
    const dataSummary = {
      totalRecommendations: recommendations.length,
      recommendations: recommendations.map(rec => ({
        type: rec.recommendation_type,
        title: rec.title,
        priority: rec.priority,
        impact: rec.impact_score
      })),
      stockSummary: {
        totalItems: stockItems.length,
        critical: stockItems.filter(item => item.days_to_expiry && item.days_to_expiry <= 30).length,
        expired: stockItems.filter(item => item.days_to_expiry && item.days_to_expiry < 0).length
      },
      emergencies: emergencies.length
    }

    const messages = [
      {
        role: 'system',
        content: 'You are an expert inventory management advisor. Enhance the provided recommendations with actionable insights and best practices. Keep responses concise and actionable.'
      },
      {
        role: 'user',
        content: `Review these inventory recommendations and provide enhanced, actionable insights:\n\n${JSON.stringify(dataSummary, null, 2)}\n\nFor each recommendation type, provide: 1) Enhanced actionable steps, 2) Best practices, 3) Estimated impact. Format as JSON array matching the recommendations structure.`
      }
    ]

    // Create AbortController for timeout (25 seconds max)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000)

    let response: Response | null = null
    let data: any = null

    // Try Groq first
    if (groqApiKey) {
      try {
        console.log('Attempting Groq API for enhancement...')
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.1-70b-versatile', // Groq model - try this one
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          data = await response.json()
          console.log('Groq enhancement successful!')
        } else {
          console.warn('Groq API failed, trying OpenAI fallback...')
          response = null
        }
      } catch (groqError: any) {
        clearTimeout(timeoutId)
        if (groqError.name === 'AbortError') {
          console.error('Groq API request timed out')
        } else {
          console.error('Groq API error:', groqError)
        }
        // Fall through to OpenAI
      }
    }

    // Fallback to OpenAI if Groq failed or not available
    if (!data && openaiApiKey) {
      try {
        console.log('Attempting OpenAI API for enhancement...')
        const controller2 = new AbortController()
        const timeoutId2 = setTimeout(() => controller2.abort(), 25000)
        
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000
          }),
          signal: controller2.signal
        })
        clearTimeout(timeoutId2)

        if (response.ok) {
          data = await response.json()
          console.log('OpenAI enhancement successful!')
        } else {
          const errorText = await response.text()
          let errorDetails: any
          try {
            errorDetails = JSON.parse(errorText)
          } catch {
            errorDetails = { raw: errorText }
          }

          // Handle quota errors
          if (response.status === 429 && (errorDetails.error?.type === 'insufficient_quota' || errorDetails.error?.code === 'insufficient_quota')) {
            console.error('OpenAI API quota exceeded')
            return recommendations.map(() => ({}))
          }

          // Handle rate limits
          if (response.status === 429) {
            console.warn('OpenAI API rate limit reached, continuing without enhancement')
            return recommendations.map(() => ({}))
          }

          console.error('OpenAI API error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorDetails
          })
        }
      } catch (openaiError: any) {
        if (openaiError.name === 'AbortError') {
          console.error('OpenAI API request timed out after 25 seconds')
        } else {
          console.error('OpenAI API error:', openaiError)
        }
        return recommendations.map(() => ({}))
      }
    }

    if (data && data.choices && data.choices[0]?.message?.content) {
      const content = data.choices[0].message.content
      try {
        return JSON.parse(content)
      } catch {
        // If not JSON, return as enhanced text
        return recommendations.map(() => ({ recommendation: content }))
      }
    }
  } catch (error) {
    console.error('AI enhancement error:', error)
  }

  return recommendations.map(() => ({}))
}

async function generateAIRecommendations(
  stockItems: any[],
  emergencies: any[],
  dormantStock: any[],
  weeklyTasks: any[],
  branchInfo: any,
  requestedType: string | null,
  groqApiKey: string | undefined,
  openaiApiKey: string | undefined
): Promise<Recommendation[]> {
  try {
    // Prepare comprehensive data for AI analysis
    const expiring30Days = stockItems.filter(item => {
      if (!item.expiry_date) return false
      const days = item.days_to_expiry || Math.floor((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return days > 0 && days <= 30
    })
    
    const expiring60To90Days = stockItems.filter(item => {
      if (!item.expiry_date) return false
      const days = item.days_to_expiry || Math.floor((new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      return days > 60 && days <= 90
    })
    
    const lowStockItems = stockItems.filter(item => (item.quantity || 0) < 10)
    const highValueItems = stockItems.filter(item => {
      const value = (item.quantity || 0) * (item.unit_price || 0)
      return value > 10000
    })

    const dataContext = {
      branch: {
        name: branchInfo?.name || 'Unknown',
        code: branchInfo?.code || '',
        region: branchInfo?.region || ''
      },
      inventory_summary: {
        total_items: stockItems.length,
        total_value: stockItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0),
        expiring_30_days: {
          count: expiring30Days.length,
          value: expiring30Days.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0),
          items: expiring30Days.slice(0, 10).map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            expiry_date: item.expiry_date,
            days_to_expiry: item.days_to_expiry,
            value: (item.quantity || 0) * (item.unit_price || 0)
          }))
        },
        expiring_60_90_days: {
          count: expiring60To90Days.length,
          value: expiring60To90Days.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0)
        },
        low_stock: {
          count: lowStockItems.length,
          items: lowStockItems.slice(0, 10).map(item => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price
          }))
        },
        high_value_items: {
          count: highValueItems.length,
          total_value: highValueItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0)
        }
      },
      operational_data: {
        emergencies: emergencies.length,
        pending_tasks: weeklyTasks.filter(t => t.status === 'pending').length,
        dormant_stock: {
          count: dormantStock.length,
          total_value: dormantStock.reduce((sum, item) => sum + (item.excess_value || 0), 0)
        }
      },
      requested_type: requestedType || 'all'
    }

    const messages = [
      {
        role: 'system',
        content: `You are an expert AI inventory management advisor for a multi-branch pharmacy system. Analyze the provided inventory data and generate actionable, prioritized recommendations.

Your task:
1. Analyze the inventory data comprehensively
2. Identify critical issues, risks, and opportunities
3. Generate specific, actionable recommendations
4. Prioritize recommendations based on urgency and financial impact
5. Provide clear, concise recommendations with specific product names and values

Return your recommendations as a JSON array with this structure:
[
  {
    "recommendation_type": "expiry_warning" | "low_stock_alert" | "cost_reduction" | "inventory_analysis" | "reorder_suggestion" | "forecast",
    "title": "Clear, specific title",
    "recommendation": "Detailed, actionable recommendation with specific product names, quantities, values, and steps",
    "priority": "critical" | "high" | "medium" | "low",
    "impact_score": 0-100,
    "estimated_savings": numeric value if applicable,
    "metadata": {
      "expiring_count": number,
      "expiring_value": number,
      "items": [{"product_name": "...", "value": number}],
      "action_steps": ["step 1", "step 2"]
    }
  }
]

Focus on:
- Items expiring soon (use actual product names from data)
- Low stock items that need reordering
- High-value items requiring attention
- Cost reduction opportunities
- Inventory optimization
- Demand forecasting insights`
      },
      {
        role: 'user',
        content: `Analyze this inventory data for ${dataContext.branch.name} branch and generate AI-powered recommendations:\n\n${JSON.stringify(dataContext, null, 2)}\n\nGenerate comprehensive, actionable recommendations. Use actual product names from the data. Return as JSON array.`
      }
    ]

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response | null = null
    let data: any = null

    // Try Groq first
    if (groqApiKey) {
      try {
        console.log('Generating AI recommendations with Groq...')
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.1-70b-versatile',
            messages: messages,
            temperature: 0.7,
            max_tokens: 3000
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (response.ok) {
          data = await response.json()
          console.log('Groq AI recommendations generated successfully!')
        } else {
          console.warn('Groq API failed, trying OpenAI fallback...')
          response = null
        }
      } catch (groqError: any) {
        clearTimeout(timeoutId)
        if (groqError.name === 'AbortError') {
          console.error('Groq API request timed out')
        } else {
          console.error('Groq API error:', groqError)
        }
      }
    }

    // Fallback to OpenAI
    if (!data && openaiApiKey) {
      try {
        console.log('Generating AI recommendations with OpenAI...')
        const controller2 = new AbortController()
        const timeoutId2 = setTimeout(() => controller2.abort(), 30000)
        
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages,
            temperature: 0.7,
            max_tokens: 3000
          }),
          signal: controller2.signal
        })
        clearTimeout(timeoutId2)

        if (response.ok) {
          data = await response.json()
          console.log('OpenAI AI recommendations generated successfully!')
        } else {
          const errorText = await response.text()
          console.error('OpenAI API error:', errorText)
        }
      } catch (openaiError: any) {
        if (openaiError.name === 'AbortError') {
          console.error('OpenAI API request timed out')
        } else {
          console.error('OpenAI API error:', openaiError)
        }
      }
    }

    if (data && data.choices && data.choices[0]?.message?.content) {
      const content = data.choices[0].message.content
      console.log('AI response received, length:', content.length)
      
      try {
        // Try to extract JSON from the response (might be wrapped in markdown code blocks)
        let jsonContent = content.trim()
        
        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```')) {
          const lines = jsonContent.split('\n')
          jsonContent = lines.slice(1, -1).join('\n').trim()
          if (jsonContent.startsWith('json')) {
            jsonContent = lines.slice(2, -1).join('\n').trim()
          }
        }
        
        const parsed = JSON.parse(jsonContent)
        console.log('Parsed AI response:', Object.keys(parsed))
        
        // Handle different response formats
        let recommendationsArray: any[] = []
        
        if (Array.isArray(parsed)) {
          recommendationsArray = parsed
        } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
          recommendationsArray = parsed.recommendations
        } else if (parsed.data && Array.isArray(parsed.data)) {
          recommendationsArray = parsed.data
        } else {
          // Try to extract recommendations from object
          const keys = Object.keys(parsed)
          if (keys.length > 0 && Array.isArray(parsed[keys[0]])) {
            recommendationsArray = parsed[keys[0]]
          }
        }
        
        console.log(`Extracted ${recommendationsArray.length} recommendations from AI response`)
        
        if (recommendationsArray.length === 0) {
          console.warn('No recommendations found in AI response, structure:', Object.keys(parsed))
          return []
        }
        
        return recommendationsArray.map((rec: any) => ({
          branch_id: branchInfo?.id || null,
          recommendation_type: rec.recommendation_type || 'inventory_analysis',
          title: rec.title || 'AI Recommendation',
          recommendation: rec.recommendation || rec.recommendation_text || '',
          priority: (['critical', 'high', 'medium', 'low'].includes(rec.priority?.toLowerCase()) 
            ? rec.priority.toLowerCase() 
            : 'medium') as 'low' | 'medium' | 'high' | 'critical',
          impact_score: rec.impact_score || rec.impact || 50,
          metadata: rec.metadata || rec.details || {},
          estimated_savings: rec.estimated_savings || rec.savings || null,
          related_stock_items: (rec.metadata?.items || rec.items || []).map((item: any) => {
            // Try to find matching stock item ID
            const itemName = item.product_name || item.name || item
            const matchingItem = stockItems.find(si => 
              si.product_name === itemName || 
              si.id === item.id || 
              si.id === item
            )
            return matchingItem?.id
          }).filter(Boolean) || null
        }))
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError)
        console.error('Response content:', content.substring(0, 500))
        // Try to extract recommendations from text format
        return []
      }
    }
  } catch (error) {
    console.error('Error generating AI recommendations:', error)
  }

  return []
}
