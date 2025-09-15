import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://your-project.supabase.co'
const supabaseKey = 'your-anon-key'

const supabase = createClient(supabaseUrl, supabaseKey)

async function displayWeeklyTasks() {
  console.log('🔍 Fetching weekly_tasks table contents...\n')
  
  try {
    // Get all tasks
    const { data: tasks, error } = await supabase
      .from('weekly_tasks')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('❌ Error fetching tasks:', error)
      return
    }
    
    console.log(`📊 Total tasks found: ${tasks.length}\n`)
    
    if (tasks.length === 0) {
      console.log('📭 No tasks found in the weekly_tasks table')
      return
    }
    
    // Display all tasks
    console.log('📋 All Weekly Tasks:')
    console.log('=' .repeat(80))
    
    tasks.forEach((task, index) => {
      console.log(`\n${index + 1}. Task ID: ${task.id}`)
      console.log(`   Title: ${task.title}`)
      console.log(`   Description: ${task.description || 'N/A'}`)
      console.log(`   Assigned To: ${task.assigned_to}`)
      console.log(`   Assigned By: ${task.assigned_by}`)
      console.log(`   Due Date: ${task.due_date}`)
      console.log(`   Priority: ${task.priority}`)
      console.log(`   Status: ${task.status}`)
      console.log(`   WhatsApp Sent: ${task.whatsapp_sent}`)
      console.log(`   Created: ${task.created_at}`)
      console.log(`   Updated: ${task.updated_at}`)
    })
    
    // Summary statistics
    console.log('\n📈 Summary Statistics:')
    console.log('=' .repeat(40))
    
    const statusCounts = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})
    
    const priorityCounts = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1
      return acc
    }, {})
    
    console.log('\nBy Status:')
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`)
    })
    
    console.log('\nBy Priority:')
    Object.entries(priorityCounts).forEach(([priority, count]) => {
      console.log(`  ${priority}: ${count}`)
    })
    
  } catch (err) {
    console.error('❌ Error:', err)
  }
}

displayWeeklyTasks()
