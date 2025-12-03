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
    // Validate required environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

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

    // Parse request body
    const { branch_id, months_ahead = 6 } = await req.json()

    if (!branch_id) {
      return new Response(
        JSON.stringify({ error: 'branch_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch stock items for the branch
    const { data: stockItems, error: stockError } = await supabaseAdmin
      .from('stock_items')
      .select('*')
      .eq('branch_id', branch_id)
      .eq('status', 'active')

    if (stockError) {
      console.error('Error fetching stock items:', stockError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stock data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch historical movement data for demand forecasting
    const { data: movements } = await supabaseAdmin
      .from('stock_movement_history')
      .select('*')
      .or(`from_branch_id.eq.${branch_id},to_branch_id.eq.${branch_id}`)
      .order('created_at', { ascending: false })
      .limit(1000)

    // Generate forecasts
    const forecast = {
      expiry_forecast: generateExpiryForecast(stockItems || [], months_ahead),
      demand_forecast: generateDemandForecast(stockItems || [], movements || [], months_ahead),
      reorder_points: generateReorderPoints(stockItems || [], movements || []),
      risk_assessment: generateRiskAssessment(stockItems || [], months_ahead)
    }

    // Use AI to enhance forecasts if available
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (groqApiKey || openaiApiKey) {
      try {
        const enhancedForecast = await enhanceForecastWithAI(forecast, stockItems || [], groqApiKey, openaiApiKey)
        return new Response(
          JSON.stringify({ 
            success: true,
            forecast: enhancedForecast,
            generated_at: new Date().toISOString()
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (aiError) {
        console.warn('AI enhancement failed, returning basic forecast:', aiError)
        // Continue with basic forecast
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        forecast: forecast,
        generated_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Forecast error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function generateExpiryForecast(stockItems: any[], monthsAhead: number): Record<string, any> {
  const forecast: Record<string, any> = {}
  const now = new Date()

  for (let i = 1; i <= monthsAhead; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + i + 1, 0)
    const monthName = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' })

    const expiringItems = stockItems.filter(item => {
      if (!item.expiry_date) return false
      const expiryDate = new Date(item.expiry_date)
      return expiryDate >= targetDate && expiryDate <= nextMonth
    })

    const totalValue = expiringItems.reduce((sum, item) => {
      return sum + ((item.quantity || 0) * (item.unit_price || 0))
    }, 0)

    forecast[monthName] = {
      count: expiringItems.length,
      value: totalValue,
      items: expiringItems.slice(0, 10).map((item: any) => ({
        id: item.id,
        product_name: item.product_name,
        expiry_date: item.expiry_date,
        value: (item.quantity || 0) * (item.unit_price || 0)
      }))
    }
  }

  return forecast
}

function generateDemandForecast(stockItems: any[], movements: any[], monthsAhead: number): Record<string, any> {
  const forecast: Record<string, any> = {}
  const now = new Date()

  // Calculate average monthly demand from historical movements
  const monthlyDemand: Record<string, number> = {}
  movements.forEach((movement: any) => {
    if (!movement.created_at) return
    const date = new Date(movement.created_at)
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    monthlyDemand[monthKey] = (monthlyDemand[monthKey] || 0) + (movement.quantity_moved || 0)
  })

  const avgDemand = Object.values(monthlyDemand).reduce((sum, val) => sum + val, 0) / Math.max(Object.keys(monthlyDemand).length, 1)

  for (let i = 1; i <= monthsAhead; i++) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const monthName = targetDate.toLocaleString('default', { month: 'long', year: 'numeric' })

    // Simple forecast: use average demand with seasonal adjustment
    const seasonalFactor = getSeasonalFactor(targetDate.getMonth())
    const expectedDemand = Math.round(avgDemand * seasonalFactor)

    forecast[monthName] = {
      expected_demand: expectedDemand,
      confidence: 'medium',
      seasonal_factor: seasonalFactor
    }
  }

  return forecast
}

function generateReorderPoints(stockItems: any[], movements: any[]): any[] {
  const reorderPoints: any[] = []

  stockItems.forEach((item: any) => {
    // Calculate average monthly consumption
    const itemMovements = movements.filter((m: any) => 
      m.stock_item_id === item.id || 
      (m.notes && m.notes.includes(item.product_name))
    )

    const totalMoved = itemMovements.reduce((sum: number, m: any) => sum + (m.quantity_moved || 0), 0)
    const monthsOfData = Math.max(new Set(itemMovements.map((m: any) => {
      if (!m.created_at) return ''
      const d = new Date(m.created_at)
      return `${d.getFullYear()}-${d.getMonth()}`
    })).size, 1)

    const avgMonthlyConsumption = totalMoved / monthsOfData
    const leadTimeDays = 7 // Assume 7 days lead time
    const safetyStock = avgMonthlyConsumption * 0.3 // 30% safety stock
    const reorderPoint = Math.ceil((avgMonthlyConsumption / 30) * leadTimeDays + safetyStock)

    if (item.quantity <= reorderPoint * 1.5) { // Only flag items that are close to reorder point
      reorderPoints.push({
        product_name: item.product_name,
        product_id: item.id,
        current_stock: item.quantity,
        reorder_point: reorderPoint,
        avg_monthly_consumption: Math.round(avgMonthlyConsumption),
        days_until_reorder: Math.max(0, Math.round(((item.quantity - reorderPoint) / avgMonthlyConsumption) * 30))
      })
    }
  })

  return reorderPoints.sort((a, b) => a.days_until_reorder - b.days_until_reorder)
}

function generateRiskAssessment(stockItems: any[], monthsAhead: number): any {
  const now = new Date()
  let totalRiskValue = 0
  let highRiskItems = 0
  let mediumRiskItems = 0

  stockItems.forEach((item: any) => {
    if (!item.expiry_date) return
    const expiryDate = new Date(item.expiry_date)
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const itemValue = (item.quantity || 0) * (item.unit_price || 0)

    if (daysUntilExpiry <= 30) {
      totalRiskValue += itemValue
      highRiskItems++
    } else if (daysUntilExpiry <= 90) {
      totalRiskValue += itemValue * 0.5
      mediumRiskItems++
    }
  })

  return {
    total_risk_value: totalRiskValue,
    high_risk_items: highRiskItems,
    medium_risk_items: mediumRiskItems,
    risk_level: totalRiskValue > 100000 ? 'high' : totalRiskValue > 50000 ? 'medium' : 'low',
    recommendations: generateRiskRecommendations(totalRiskValue, highRiskItems, mediumRiskItems)
  }
}

function generateRiskRecommendations(totalRisk: number, highRisk: number, mediumRisk: number): string[] {
  const recommendations: string[] = []
  
  if (highRisk > 0) {
    recommendations.push(`Immediate action needed: ${highRisk} items expiring within 30 days (Risk value: UGX ${totalRisk.toLocaleString()})`)
  }
  if (mediumRisk > 0) {
    recommendations.push(`Proactive planning: ${mediumRisk} items expiring in 30-90 days - start planning sales campaigns`)
  }
  if (totalRisk > 100000) {
    recommendations.push('High financial risk detected - consider emergency redistribution or supplier negotiations')
  }

  return recommendations
}

function getSeasonalFactor(month: number): number {
  // Simple seasonal adjustment factors (can be enhanced with historical data)
  const factors: Record<number, number> = {
    0: 1.1,  // January
    1: 1.0,  // February
    2: 0.9,  // March
    3: 0.95, // April
    4: 1.0,  // May
    5: 1.05, // June
    6: 1.1,  // July
    7: 1.15, // August
    8: 1.1,  // September
    9: 1.0,  // October
    10: 0.95, // November
    11: 1.05  // December
  }
  return factors[month] || 1.0
}

async function enhanceForecastWithAI(
  forecast: any,
  stockItems: any[],
  groqApiKey: string | undefined,
  openaiApiKey: string | undefined
): Promise<any> {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert inventory forecasting analyst. Enhance the provided forecast data with actionable insights and predictions. Keep responses concise and data-driven.'
    },
    {
      role: 'user',
      content: `Analyze this inventory forecast and provide enhanced insights:\n\n${JSON.stringify(forecast, null, 2)}\n\nProvide: 1) Key risks and opportunities, 2) Actionable recommendations, 3) Confidence levels. Format as JSON.`
    }
  ]

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 20000)

  try {
    let response: Response | null = null

    // Try Groq first
    if (groqApiKey) {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: messages,
          temperature: 0.7,
          max_tokens: 800
        }),
        signal: controller.signal
      })
    }

    // Fallback to OpenAI
    if (!response?.ok && openaiApiKey) {
      clearTimeout(timeoutId)
      const newController = new AbortController()
      const newTimeoutId = setTimeout(() => newController.abort(), 20000)
      
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
          max_tokens: 800
        }),
        signal: newController.signal
      })
      clearTimeout(newTimeoutId)
    }

    if (response?.ok) {
      const data = await response.json()
      if (data.choices && data.choices[0]) {
        try {
          const aiInsights = JSON.parse(data.choices[0].message.content)
          return {
            ...forecast,
            ai_insights: aiInsights
          }
        } catch {
          // If AI response isn't JSON, add as text
          return {
            ...forecast,
            ai_insights: { notes: data.choices[0].message.content }
          }
        }
      }
    }
  } catch (error) {
    console.warn('AI enhancement failed:', error)
  } finally {
    clearTimeout(timeoutId)
  }

  return forecast
}

