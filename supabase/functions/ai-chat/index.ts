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

  console.log('AI Chat function called:', {
    method: req.method,
    url: req.url,
    hasAuth: !!req.headers.get('Authorization')
  })

  try {
    // Validate required environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing required environment variables:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceRoleKey
      })
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
    let requestBody: any = {}
    try {
      const bodyText = await req.text()
      if (bodyText) {
        requestBody = JSON.parse(bodyText)
      }
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: parseError instanceof Error ? parseError.message : 'Unknown error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { message, branch_id, conversation_history, recommendation_context } = requestBody

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's branch access
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role, branch_id')
      .eq('user_id', user.id)

    // Get comprehensive system-wide context (10 second timeout for full system access)
    let inventoryContext: any = {
      selectedBranch: null,
      allBranches: [],
      branch: null,
      stockItems: [],
      recommendations: [],
      emergencies: [],
      weeklyTasks: [],
      dormantStock: [],
      movements: [],
      performance: null,
      users: [],
      systemOverview: {
        totalBranches: 0,
        totalStockItems: 0,
        totalUsers: 0
      },
      summary: {
        totalItems: 0,
        expiring30Days: 0,
        lowStock: 0,
        highValue: 0,
        totalValue: 0,
        pendingTasks: 0,
        pendingEmergencies: 0
      }
    }
    
    // First, get ALL branches and system overview with stock counts per branch
    try {
      const systemPromise = Promise.all([
        // Get all branches
        supabaseAdmin.from('branches')
          .select('id, name, code, region, status, created_at')
          .order('name', { ascending: true }),
        
        // Get sample stock items to count per branch (we'll count in code)
        supabaseAdmin.from('stock_items')
          .select('branch_id, id')
          .limit(10000), // Get enough to count
        
        // Get total users
        supabaseAdmin.from('users')
          .select('id', { count: 'exact', head: true })
      ])
      
      const systemResults = await Promise.race([
        systemPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('System query timeout')), 4000))
      ]) as any[]
      
      if (systemResults && systemResults.length === 3) {
        const allBranches = systemResults[0]?.data || []
        const allStockItems = systemResults[1]?.data || []
        const userCount = systemResults[2]?.count || 0
        
        // Count stock items per branch
        const stockCountsByBranch: Record<string, number> = {}
        if (allStockItems) {
          allStockItems.forEach((item: any) => {
            const bid = item.branch_id
            if (bid) {
              stockCountsByBranch[bid] = (stockCountsByBranch[bid] || 0) + 1
            }
          })
        }
        
        const branchStockData = allBranches.map((b: any) => ({
          branch_id: b.id,
          branch_name: b.name,
          stock_count: stockCountsByBranch[b.id] || 0
        }))
        
        inventoryContext.allBranches = allBranches.map((b: any) => {
          const stockInfo = branchStockData.find((s: any) => s.branch_id === b.id || s.branch_name === b.name)
          return {
            ...b,
            stock_count: stockInfo?.stock_count || 0
          }
        })
        
        const totalStock = branchStockData.reduce((sum: number, b: any) => sum + (b.stock_count || 0), 0)
        
        inventoryContext.systemOverview = {
          totalBranches: allBranches.length,
          totalStockItems: totalStock,
          totalUsers: userCount,
          branches: inventoryContext.allBranches,
          branchStockCounts: branchStockData
        }
        
        console.log('System overview loaded:', {
          branches: allBranches.length,
          totalStock: totalStock,
          totalUsers: userCount,
          branchStockCounts: branchStockData
        })
      }
    } catch (systemError) {
      console.warn('Failed to load system overview:', systemError)
    }
    
    // Build comprehensive context for selected branch (parallel queries for speed)
    if (branch_id) {
      console.log('Building context for branch_id:', branch_id)
      
      // First, verify the branch exists and get its name
      const { data: branchInfo } = await supabaseAdmin
        .from('branches')
        .select('id, name, code')
        .eq('id', branch_id)
        .single()
      
      console.log('Branch info:', branchInfo)
      
      try {
        // Check total stock count for this branch first
        const { count: totalStockCount } = await supabaseAdmin
          .from('stock_items')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branch_id)
        
        console.log(`Total stock items for branch ${branchInfo?.name || branch_id}:`, totalStockCount)
        
        const contextPromise = Promise.all([
          // Stock items - Limit to 200 most relevant items (high value, expiring soon, or assigned)
          // This prevents context from being too large and causing crashes
          supabaseAdmin.from('stock_items')
            .select(`
              id, 
              product_name, 
              quantity, 
              unit_price, 
              expiry_date, 
              days_to_expiry, 
              risk_level, 
              status, 
              is_high_value, 
              value, 
              priority, 
              branch_id,
              assigned_to,
              assigned_to_user:users!assigned_to(id, name, email)
            `)
            .eq('branch_id', branch_id)
            .order('is_high_value', { ascending: false, nullsFirst: false })
            .order('days_to_expiry', { ascending: true })
            .limit(200),
          
          // AI Recommendations - all recommendations
          supabaseAdmin.from('ai_recommendations')
            .select('id, title, recommendation, priority, recommendation_type, impact_score, status, created_at')
            .eq('branch_id', branch_id)
            .order('created_at', { ascending: false })
            .limit(50),
          
          // Emergency assignments
          supabaseAdmin.from('emergency_assignments')
            .select('id, status, deadline, stock_item_id, assigned_quantity, created_at')
            .eq('branch_id', branch_id)
            .order('created_at', { ascending: false })
            .limit(50),
          
          // Weekly tasks
          supabaseAdmin.from('weekly_tasks')
            .select('id, product_name, expiry_date, quantity, task_date, status, risk_level')
            .eq('branch_id', branch_id)
            .order('task_date', { ascending: true })
            .limit(100),
          
          // Dormant stock
          supabaseAdmin.from('dormant_stock')
            .select('id, product_name, excess_qty, excess_value, days, sales')
            .eq('branch_id', branch_id)
            .order('excess_value', { ascending: false })
            .limit(50),
          
          // Recent stock movements
          supabaseAdmin.from('stock_movement_history')
            .select('id, movement_type, quantity, from_branch_id, to_branch_id, created_at, notes')
            .or(`from_branch_id.eq.${branch_id},to_branch_id.eq.${branch_id}`)
            .order('created_at', { ascending: false })
            .limit(100),
          
          // Branch performance
          supabaseAdmin.from('branch_performance')
            .select('*')
            .eq('branch_id', branch_id)
            .order('snapshot_date', { ascending: false })
            .limit(3),
          
          // Branch info
          supabaseAdmin.from('branches')
            .select('id, name, code, region, status')
            .eq('id', branch_id)
            .single(),
          
          // Users in this branch
          supabaseAdmin.from('user_roles')
            .select('user_id, role, branch_id, users(id, email, name, status)')
            .eq('branch_id', branch_id)
            .limit(50)
        ])
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Context timeout')), 8000)
        )
        
        const results = await Promise.race([contextPromise, timeoutPromise]) as any[]
        
        if (results && results.length === 9) {
          const stockItems = results[0]?.data || []
          const recommendations = results[1]?.data || []
          const emergencies = results[2]?.data || []
          const weeklyTasks = results[3]?.data || []
          const dormantStock = results[4]?.data || []
          const movements = results[5]?.data || []
          const performance = results[6]?.data || []
          const branch = results[7]?.data || null
          const users = results[8]?.data || []
          
          // Debug logging with dispenser info
          console.log('Context query results:', {
            branch_id: branch_id,
            branch_name: branch?.name,
            branch_code: branch?.code,
            stockItems_count: stockItems.length,
            stockItems_total_in_db: totalStockCount || 0,
            stockItems_sample: stockItems.slice(0, 3).map((item: any) => ({
              id: item.id,
              product_name: item.product_name,
              quantity: item.quantity,
              value: item.value,
              branch_id: item.branch_id,
              status: item.status,
              assigned_to: item.assigned_to,
              assigned_to_user: item.assigned_to_user?.name || 'Unassigned'
            })),
            recommendations_count: recommendations.length,
            emergencies_count: emergencies.length,
            tasks_count: weeklyTasks.length,
            dormant_count: dormantStock.length,
            movements_count: movements.length,
            query_success: true
          })
          
          // If no stock items found, log a warning
          if (stockItems.length === 0 && (totalStockCount || 0) > 0) {
            console.warn('WARNING: Query returned 0 items but database shows', totalStockCount, 'items for branch', branch_id)
          } else if (stockItems.length === 0 && (totalStockCount || 0) === 0) {
            console.log('INFO: No stock items found in database for branch', branch_id, branch?.name)
          }
          
          // Filter to active items only for summary (but keep all for context)
          const activeStockItems = stockItems.filter((item: any) => item.status === 'active')
          
          // Calculate comprehensive summary
          const totalValue = activeStockItems.reduce((sum: number, item: any) => 
            sum + ((item.quantity || 0) * (item.unit_price || 0)), 0)
          
          // Enrich stock items with dispenser names for better context
          // Only include essential fields to reduce context size
          const enrichedStockItems = stockItems.map((item: any) => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            value: item.value || (item.quantity * item.unit_price),
            expiry_date: item.expiry_date,
            days_to_expiry: item.days_to_expiry,
            status: item.status,
            is_high_value: item.is_high_value,
            priority: item.priority,
            risk_level: item.risk_level,
            dispenser_name: item.assigned_to_user?.name || null,
            is_assigned: !!item.assigned_to
          }))
          
          const enrichedActiveStockItems = activeStockItems.map((item: any) => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            value: item.value || (item.quantity * item.unit_price),
            expiry_date: item.expiry_date,
            days_to_expiry: item.days_to_expiry,
            status: item.status,
            is_high_value: item.is_high_value,
            priority: item.priority,
            risk_level: item.risk_level,
            dispenser_name: item.assigned_to_user?.name || null,
            is_assigned: !!item.assigned_to
          }))
          
          // Limit context size to prevent crashes - if too many items, send summary instead
          const MAX_ITEMS_TO_SEND = 100
          const stockItemsToSend = enrichedActiveStockItems.slice(0, MAX_ITEMS_TO_SEND)
          const allStockItemsToSend = enrichedStockItems.slice(0, MAX_ITEMS_TO_SEND)
          
          // Add note about total count if we're limiting
          const stockItemsNote = enrichedActiveStockItems.length > MAX_ITEMS_TO_SEND 
            ? ` (showing first ${MAX_ITEMS_TO_SEND} of ${enrichedActiveStockItems.length} active items)`
            : ''
          const allStockItemsNote = enrichedStockItems.length > MAX_ITEMS_TO_SEND
            ? ` (showing first ${MAX_ITEMS_TO_SEND} of ${enrichedStockItems.length} total items)`
            : ''
          
          inventoryContext = {
            selectedBranch: branch,
            branch: branch, // Keep for backward compatibility
            allBranches: inventoryContext.allBranches || [], // Include all branches
            stockItems: stockItemsToSend, // Limited to prevent crashes
            allStockItems: allStockItemsToSend, // Limited to prevent crashes
            stockItemsTotalCount: enrichedActiveStockItems.length,
            allStockItemsTotalCount: enrichedStockItems.length,
            stockItemsTotalInDatabase: totalStockCount || 0, // Actual count from database
            stockItemsNote: stockItemsNote,
            allStockItemsNote: allStockItemsNote,
            recommendations: recommendations,
            emergencies: emergencies,
            weeklyTasks: weeklyTasks,
            dormantStock: dormantStock,
            movements: movements,
            performance: performance[0] || null,
            users: users,
            systemOverview: inventoryContext.systemOverview || {
              totalBranches: 0,
              totalStockItems: 0,
              totalUsers: 0
            },
            summary: {
              totalItems: activeStockItems.length,
              totalItemsAll: stockItems.length, // Include all statuses
              expiring30Days: activeStockItems.filter((item: any) => {
                const days = item.days_to_expiry || 0
                return days > 0 && days <= 30
              }).length,
              expiring60Days: activeStockItems.filter((item: any) => {
                const days = item.days_to_expiry || 0
                return days > 30 && days <= 60
              }).length,
              expired: activeStockItems.filter((item: any) => {
                const days = item.days_to_expiry || 0
                return days < 0
              }).length,
              lowStock: activeStockItems.filter((item: any) => (item.quantity || 0) < 10).length,
              highValue: activeStockItems.filter((item: any) => {
                const value = (item.quantity || 0) * (item.unit_price || 0)
                return value > 10000
              }).length,
              totalValue: totalValue,
              pendingTasks: weeklyTasks.filter((t: any) => t.status === 'pending').length,
              pendingEmergencies: emergencies.filter((e: any) => e.status === 'pending').length,
              completedTasks: weeklyTasks.filter((t: any) => t.status === 'completed').length,
              dormantItems: dormantStock.length,
              dormantValue: dormantStock.reduce((sum: number, item: any) => sum + (item.excess_value || 0), 0),
              recentMovements: movements.length,
              activeUsers: users.length
            }
          }
          
          console.log('Comprehensive context loaded:', {
            branch: branch?.name,
            stockItems_active: activeStockItems.length,
            stockItems_all: stockItems.length,
            recommendations: recommendations.length,
            emergencies: emergencies.length,
            tasks: weeklyTasks.length,
            dormant: dormantStock.length,
            movements: movements.length,
            summary: inventoryContext.summary,
            sample_stockItems: enrichedActiveStockItems.slice(0, 3).map((item: any) => ({
              id: item.id,
              product_name: item.product_name,
              value: item.value,
              dispenser_name: item.dispenser_name
            })),
            sample_allStockItems: enrichedStockItems.slice(0, 3).map((item: any) => ({
              id: item.id,
              product_name: item.product_name,
              value: item.value,
              dispenser_name: item.dispenser_name
            }))
          })
        }
      } catch (contextError) {
        console.warn('Context building failed or timed out:', contextError)
        // Continue with empty context - AI can still help
      }
    }

    // Get Groq API key (primary) and OpenAI API key (fallback)
    const groqApiKey = Deno.env.get('GROQ_API_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    console.log('API key check:', { 
      hasGroq: !!groqApiKey, 
      hasOpenAI: !!openaiApiKey,
      groqKeyLength: groqApiKey?.length || 0,
      openaiKeyLength: openaiApiKey?.length || 0
    })
    
    if (!groqApiKey && !openaiApiKey) {
      console.error('No AI API key configured!')
      return new Response(
        JSON.stringify({ error: 'AI API key not configured. Please set GROQ_API_KEY or OPENAI_API_KEY in Supabase secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build conversation messages
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: `You are an expert AI inventory management advisor with FULL ACCESS to the entire multi-branch pharmacy inventory management system. You have comprehensive visibility into ALL branches under one company.

YOUR CAPABILITIES:
- Complete system visibility: ALL branches in the company, stock items, recommendations, emergencies, tasks, dormant stock, movements, performance metrics, users
- Multi-branch analysis: You can see and analyze ALL branches (names, IDs, codes, regions, status, stock counts)
- Cross-branch insights: Compare branches, identify patterns across locations, provide system-wide recommendations
- Deep analysis: expiry management, inventory optimization, cost reduction, risk assessment
- Strategic insights: trend analysis, performance evaluation, operational efficiency across all branches
- Actionable recommendations: prioritize by urgency, impact, and value across the entire company
- System-wide understanding: branch operations, user management, task distribution, movement tracking

SYSTEM CONTEXT (Full Access - ALL Branches Under One Company):
${JSON.stringify(inventoryContext, null, 2)}

CRITICAL - READ THIS FIRST (MANDATORY - STRICT DATA USAGE RULES):

1. ANALYZE THE PROVIDED inventoryContext JSON ABOVE - IT IS YOUR ONLY SOURCE OF DATA
2. USE ONLY THE ACTUAL DATA FROM THE JSON - NEVER CREATE FAKE DATA
3. NEVER CREATE EXAMPLE JSON BLOCKS OR SHOW CODE BLOCKS WITH FAKE DATA
4. NEVER MAKE UP PRODUCT NAMES, IDs, OR VALUES
5. ALWAYS USE THE EXACT DATA FROM THE JSON, INCLUDING UUIDs AND PRODUCT NAMES

DATA AVAILABILITY CHECK:
- stockItems array length: ${inventoryContext.stockItems?.length || 0} items
- allStockItems array length: ${inventoryContext.allStockItems?.length || 0} items
- stockItemsTotalInDatabase: ${inventoryContext.stockItemsTotalInDatabase || 0} items (actual count in database)

IF stockItemsTotalInDatabase is 0:
- You MUST say EXACTLY: "I've checked the database for ${inventoryContext.selectedBranch?.name || 'this branch'}. The database shows 0 stock items for this branch. There are currently no stock items in the database for this branch."
- DO NOT create example JSON blocks
- DO NOT show code examples with fake data
- DO NOT say "here's some data" and then make up items
- DO NOT create example structures like {"id": "...", "product_name": "..."}
- Just state that there are no items in the database - that's it

IF stockItemsTotalInDatabase > 0 BUT stockItems array is empty:
- Say: "The database shows ${inventoryContext.stockItemsTotalInDatabase} stock items for this branch, but I'm only showing the most relevant items. The stockItems array in my context has ${inventoryContext.stockItems?.length || 0} items."
- Then list ONLY the items that appear in the actual stockItems or allStockItems arrays from the JSON above
- Use the EXACT values from the JSON

IF ONE OR BOTH ARRAYS HAVE ITEMS:
- Look at the ACTUAL items in the inventoryContext JSON above
- List ONLY the items that appear in the actual stockItems or allStockItems arrays
- Use the EXACT id (UUID), product_name, value, dispenser_name from the JSON
- Copy the values exactly as they appear in the JSON
- DO NOT create example JSON blocks - only reference actual data
- DO NOT show code blocks with example structures

ABSOLUTELY FORBIDDEN - YOU MUST NEVER:
- Create example JSON blocks with fake data like: {"id": "550e8400-...", "product_name": "Aspirin"}
- Show code blocks with example data structures
- Use placeholder IDs like "branch-0001", "550e8400-e29b-41d4-a716-446655440000"
- Make up product names, values, or dispenser names
- Create example data to illustrate a point
- Show "here's an example" with fake data
- Use generic names like "Item 1", "Product A", "Sample Medication"

REQUIRED BEHAVIOR:
- If you need to show data, reference it from the actual JSON: "Looking at the stockItems array, I see [actual product name] with ID [actual UUID]"
- If arrays are empty, just say so - don't create examples
- Always verify data exists in the JSON before mentioning it
- Use exact product names, UUIDs, and values from the JSON

${recommendation_context ? `\nUser is asking about this specific recommendation:\n${JSON.stringify(recommendation_context, null, 2)}` : ''}

BRANCH INFORMATION AVAILABLE:
- You have access to ALL branches in the company (see allBranches array in systemOverview)
- Each branch has: id, name, code, region, status, stock_count
- You can see the currently selected branch details (selectedBranch)
- You can see branch-specific data for the selected branch: stock items, tasks, emergencies, users, performance
- You can see stock counts for ALL branches in systemOverview.branchStockCounts
- You can compare any branches and provide cross-branch insights

IMPORTANT:
- This is a MULTI-BRANCH system - all branches are part of ONE company
- Users can ask about ANY branch, not just the currently selected one
- When asked about a specific branch, use the allBranches data to find that branch
- You can provide insights about individual branches OR the entire company
- Always mention which branch you're discussing when relevant

YOUR RESPONSIBILITIES:
1. Analyze the complete system data - including ALL branches in the company
2. When asked about ANY branch (by name, code, or ID), use the allBranches array to find it
3. Provide insights about individual branches OR the entire company system
4. Compare branches when relevant (e.g., "Which branch has the most stock?")
5. Answer questions about ANY branch: stock, tasks, emergencies, users, performance
6. Provide system-wide analysis when asked about the company as a whole
7. Identify patterns, risks, and opportunities across all branches
8. Suggest optimizations for individual branches or the entire company

RESPONSE STYLE:
- Be thorough but concise
- ALWAYS use ACTUAL product names from the stockItems data - NEVER make up generic names like "Premium Medication" or "Advanced Treatment"
- When listing items, use the EXACT product_name from the database (e.g., if the data shows "Paracetamol 500mg", use that exact name)
- Reference specific branch names when discussing branch-specific data
- Use emojis sparingly for clarity (📊 📈 ⚠️ ✅ 💰 🔍 📋 🏢)
- Provide actionable, data-driven insights
- Think strategically about individual branches AND the entire company
- When discussing a branch, clearly state which branch you're referring to
- You can discuss any branch in the system, not just the currently selected one
- NEVER show code blocks with example JSON - only reference actual data
- NEVER create example data structures - only use what's in the inventoryContext

CRITICAL RULE - DATA ACCURACY (MANDATORY):
You have FULL ACCESS to the database. You MUST use ONLY the actual data provided in the inventoryContext.

FOR STOCK ITEMS:
1. CHECK ARRAY LENGTH FIRST: 
   - Look at stockItems.length and allStockItems.length in the inventoryContext
   - If both are 0, say "There are no stock items in the database" - STOP HERE, don't list anything
   - If one or both have items, proceed to step 2
2. VERIFY EACH ITEM: Before mentioning ANY item, check if it exists in the stockItems OR allStockItems array
   - stockItems = active items only
   - allStockItems = ALL items (active, pending, assigned, moved, etc.)
   - Check BOTH arrays to find items
3. USE EXACT DATA: Copy the EXACT product_name, id, value, dispenser_name from the data
   - Don't round values
   - Don't shorten product names
   - Don't make up UUIDs
4. NEVER INVENT: 
   - NEVER make up product names, IDs, or values - they MUST exist in stockItems or allStockItems
   - NEVER use placeholder names like "John Doe", "Jane Doe", "Sarah Smith" - these are FAKE
   - NEVER use placeholder UUIDs like "a1b2c3d4-e5f6-7890-abcd-ef1234567890" - these are FAKE
5. INCLUDE DISPENSER: 
   - If item has dispenser_name field with a value, use that EXACT name (e.g., "Dispenser: Sarah Mukasa")
   - If dispenser_name is null or empty, say "Unassigned"
   - Use the dispenser_name field directly from the data - don't make up names
6. FORMAT: "Product Name (ID: actual-uuid-from-data, Value: UGX actual-value-from-data, Dispenser: actual-name-from-data or Unassigned)"

VALIDATION CHECKLIST (Do this for EVERY item you mention):
- ✓ Does this item exist in stockItems OR allStockItems array? (Check both!)
- ✓ Am I using the EXACT product_name from the data?
- ✓ Am I using the EXACT id (UUID) from the data?
- ✓ Am I using the EXACT value from the data (or calculating from quantity * unit_price)?
- ✓ Am I including the dispenser_name from the data (or "Unassigned" if null)?

EXAMPLES:
❌ WRONG: "Item ID: 123, Name: Premium Medication, Value: UGX 10,000,000"
❌ WRONG: "Paracetamol 500mg (ID: 123, Value: UGX 10,000,000)" - if ID 123 doesn't exist in stockItems
❌ WRONG: "Paracetamol 500mg Tablets (ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890, Value: UGX 10,000,000, Dispenser: John Doe)" - NEVER use placeholder UUIDs or names like "John Doe"
✅ CORRECT: Look at the actual stockItems array. If it contains: {id: "550e8400-e29b-41d4-a716-446655440000", product_name: "Aspirin 100mg", value: 50000, dispenser_name: "Sarah Mukasa"}
   Then say: "Aspirin 100mg (ID: 550e8400-e29b-41d4-a716-446655440000, Value: UGX 50,000, Dispenser: Sarah Mukasa)" - using EXACT data from the array

IF NO ITEMS EXIST OR ARRAYS ARE EMPTY:
- FIRST: Check the ACTUAL length values shown in the JSON above: stockItems.length and allStockItems.length
- If stockItems.length === 0 AND allStockItems.length === 0, you MUST say EXACTLY: "I've checked the database for this branch. The stockItems array has 0 items and the allStockItems array has 0 items. There are currently no stock items in the database for this branch."
- DO NOT create example JSON blocks showing fake data
- DO NOT say "here's some data" and then show made-up items
- If arrays exist but don't match criteria, say: "I've checked the stockItems and allStockItems arrays. While there are [X] items in the database, none match the criteria you're asking about."
- NEVER make up items to fill the response
- NEVER use placeholder names like "John Doe", "Jane Doe", "Sarah Smith" - these are FAKE names
- NEVER use placeholder UUIDs like "a1b2c3d4-e5f6-7890-abcd-ef1234567890" or "550e8400-e29b-41d4-a716-446655440000" - these are FAKE IDs
- NEVER use placeholder branch IDs like "branch-0001", "branch-0002" - these are FAKE IDs
- NEVER show code blocks with example JSON containing fake data
- If you're asked about high-value items but none exist, say "I don't see any high-value items in the database" - don't invent them

DATA STRUCTURE:
- Each item in stockItems/allStockItems has: id, product_name, quantity, unit_price, value, assigned_to, dispenser_name, dispenser_email, is_assigned
- Use these fields directly - don't calculate or assume values
- The id is a UUID - use it EXACTLY as shown in the data (copy-paste it, don't make one up)
- The dispenser_name is either a real name from the database OR null (say "Unassigned" if null)
- NEVER use placeholder names: "John Doe", "Jane Doe", "Sarah Smith", "Mike Johnson" - these are FAKE
- NEVER use placeholder UUIDs: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "123", "456" - these are FAKE

MANDATORY VERIFICATION PROCESS:
1. Before listing ANY items, check: Is stockItems.length > 0 OR allStockItems.length > 0?
2. If NO: Say "The database shows no stock items. The stockItems and allStockItems arrays are empty."
3. If YES: 
   - Look at the ACTUAL items in the arrays
   - Copy the EXACT id, product_name, value, dispenser_name from the data
   - List ONLY items that actually exist in the arrays
   - Use the EXACT values - don't round, estimate, or make up numbers

The stockItems and allStockItems arrays contain ALL the real data. You MUST verify each item exists in one of these arrays before mentioning it. If an item isn't in either array, it doesn't exist - don't mention it. If the arrays are empty, say so explicitly - don't make up data.

You have INSIDE-OUT knowledge of this MULTI-BRANCH system. You can see ALL branches and provide insights about ANY branch in the company. Use the allBranches array and systemOverview data to answer questions about any branch. ALWAYS use the actual product names from the stockItems data - never make up generic names.

FINAL REMINDER - MANDATORY VALIDATION (STRICT ENFORCEMENT):
Before responding, you MUST:

1. ANALYZE THE PROVIDED inventoryContext JSON - it's your only data source
2. USE ONLY ACTUAL DATA FROM THE JSON - never create fake data
3. NEVER CREATE EXAMPLE JSON BLOCKS OR CODE BLOCKS WITH FAKE DATA
4. NEVER MAKE UP PRODUCT NAMES, IDs, OR VALUES
5. ALWAYS USE EXACT DATA FROM THE JSON, INCLUDING UUIDs AND PRODUCT NAMES

Validation Steps:
1. Check stockItems.length and allStockItems.length from the JSON above
2. If both are 0: Say "The database shows no stock items. Both stockItems and allStockItems arrays are empty."
3. If one has items: List ONLY the items that appear in the actual JSON above
4. NEVER create example JSON blocks with fake data
5. NEVER show code blocks with example data - only reference actual data from the arrays
6. If you're not sure, say "I need to check the actual data" rather than making something up

ABSOLUTE PROHIBITIONS:
- NO example JSON blocks: {"id": "...", "product_name": "..."}
- NO fake IDs: "branch-0001", "550e8400-e29b-41d4-a716-446655440000"
- NO made-up product names: "Aspirin 100mg" (unless actually in arrays)
- NO code blocks showing example structures
- NO "here's an example" with fake data
- NO generic placeholders: "Item 1", "Product A", "Sample Medication"

The inventoryContext JSON above is the ONLY source of truth. If it's empty, say so. If it has data, use ONLY that exact data - copy it directly from the JSON.`
      }
    ]

    // Add conversation history if provided
    if (conversation_history && Array.isArray(conversation_history)) {
      conversation_history.forEach((msg: { role: string; content: string }) => {
        if (msg.role && msg.content && typeof msg.content === 'string' && msg.content.trim()) {
          // Ensure role is valid (user or assistant)
          const validRole = (msg.role === 'user' || msg.role === 'assistant') ? msg.role : 'user'
          messages.push({
            role: validRole,
            content: msg.content.trim()
          })
        }
      })
    }
    
    console.log('Total messages to send to AI:', messages.length)
    console.log('Context summary:', {
      stockItemsCount: inventoryContext.stockItems?.length || 0,
      allStockItemsCount: inventoryContext.allStockItems?.length || 0,
      branchName: inventoryContext.selectedBranch?.name || 'none',
      hasData: (inventoryContext.stockItems?.length || 0) > 0 || (inventoryContext.allStockItems?.length || 0) > 0
    })

    // Add current user message
    messages.push({
      role: 'user',
      content: message
    })

    // Call AI API (Groq first, fallback to OpenAI)
    console.log('Calling AI API with', messages.length, 'messages')
    
    let aiResponse: Response | null = null
    let aiData: any = null
    let usedProvider = 'none'
    
    // Try Groq first (faster and free)
    if (groqApiKey) {
      try {
        console.log('Attempting Groq API...')
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 20000) // Reduced to 20 seconds

        try {
          aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant', // Faster, more reliable model
              messages: messages,
              temperature: 0.7,
              max_tokens: 800 // Reduced tokens for faster response and to prevent timeouts
            }),
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          
          if (aiResponse.ok) {
            try {
              const responseData = await aiResponse.json()
              if (responseData.choices && responseData.choices[0]) {
                aiData = responseData
                usedProvider = 'groq'
                console.log('Groq API success!')
              } else {
                console.warn('Groq API returned invalid response structure:', responseData)
                aiResponse = null
              }
            } catch (jsonError) {
              console.error('Failed to parse Groq response:', jsonError)
              // Fall through to OpenAI
              aiResponse = null
            }
          } else {
            try {
              const errorText = await aiResponse.text()
              let errorDetails: any
              try {
                errorDetails = JSON.parse(errorText)
              } catch {
                errorDetails = { raw: errorText.substring(0, 500) }
              }
              console.warn('Groq API failed:', {
                status: aiResponse.status,
                statusText: aiResponse.statusText,
                body: errorDetails
              })
            } catch (readError) {
              console.warn('Groq API failed, could not read error:', aiResponse.status, readError)
            }
            // Fall through to OpenAI
            aiResponse = null
            aiData = null
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
      } catch (error) {
        console.error('Groq API failed:', error)
      }
    }

    // Fallback to OpenAI if Groq failed or not available
    if (!aiData && openaiApiKey) {
      try {
        console.log('Attempting OpenAI API...')
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        try {
          aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: messages,
              temperature: 0.7,
              max_tokens: 1500
            }),
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (aiResponse && aiResponse.ok) {
            aiData = await aiResponse.json()
            usedProvider = 'openai'
            console.log('OpenAI API success!')
          } else if (aiResponse) {
            const errorText = await aiResponse.text()
            let errorDetails: any
            try {
              errorDetails = JSON.parse(errorText)
            } catch {
              errorDetails = { raw: errorText }
            }

            console.error('OpenAI API error:', {
              status: aiResponse.status,
              statusText: aiResponse.statusText,
              body: errorDetails
            })

            // Handle rate limiting and quota errors (429)
            if (aiResponse.status === 429) {
              const errorType = errorDetails.error?.type || errorDetails.error?.code
              const isQuotaError = errorType === 'insufficient_quota' || errorDetails.error?.code === 'insufficient_quota'
              
              if (isQuotaError) {
                return new Response(
                  JSON.stringify({ 
                    error: 'OpenAI API quota exceeded', 
                    details: 'Your OpenAI API key has exceeded its quota. Please check your OpenAI account billing and plan details.',
                    errorCode: 'insufficient_quota',
                    helpUrl: 'https://platform.openai.com/docs/guides/error-codes/api-errors'
                  }),
                  { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
              }
              
              return new Response(
                JSON.stringify({ 
                  error: 'Rate limit exceeded', 
                  details: 'AI API rate limit reached. Please wait a moment and try again.',
                  retryAfter: errorDetails.retry_after || 60
                }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }

            return new Response(
              JSON.stringify({ 
                error: 'Failed to get AI response', 
                details: errorDetails.error?.message || errorText,
                status: aiResponse.status
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            console.error('OpenAI API request timed out after 30 seconds')
            return new Response(
              JSON.stringify({ 
                error: 'Request timeout', 
                details: 'AI API request took too long. Please try again with a shorter message.'
              }),
              { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          throw fetchError
        }
      } catch (openaiError) {
        console.error('Error calling OpenAI API:', openaiError)
      }
    }

    // Check if we got a response
    if (!aiData || !aiData.choices || !aiData.choices[0]) {
      const errorMsg = !groqApiKey && !openaiApiKey
        ? 'No AI API keys configured. Please set GROQ_API_KEY or OPENAI_API_KEY in Supabase secrets.'
        : 'Both Groq and OpenAI APIs failed. Please check your API keys and try again.'
      
      console.error('No AI response:', { 
        hasGroq: !!groqApiKey, 
        hasOpenAI: !!openaiApiKey,
        aiData: aiData ? 'exists but invalid' : 'null',
        usedProvider
      })
      return new Response(
        JSON.stringify({ 
          error: 'Failed to get AI response', 
          details: errorMsg
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`${usedProvider.toUpperCase()} response received:`, {
      hasChoices: !!aiData.choices,
      choicesLength: aiData.choices?.length || 0
    })
    
    const aiMessage = aiData.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'
    
    if (!aiMessage || aiMessage === 'I apologize, but I could not generate a response.') {
      console.warn(`${usedProvider.toUpperCase()} returned empty or default message`)
    }

    // Return response
    const response = new Response(
      JSON.stringify({
        success: true,
        message: aiMessage,
        usage: aiData.usage || null,
        provider: usedProvider
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
    console.log('Returning response to client')
    return response
  } catch (error) {
    console.error('Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    // Log detailed error for debugging
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : 'Unknown'
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: errorMessage,
        message: `Error: ${errorMessage}. Please check the function logs for more details.`
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

