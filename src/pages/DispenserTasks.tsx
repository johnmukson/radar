import React from 'react'
import WeeklyTasksTable from '@/components/WeeklyTasksTable'

const DispenserTasks = () => {
  return (
    <div className="min-h-screen w-full bg-slate-900 text-white">
      <div className="border-b border-slate-700 bg-slate-800 px-6 py-6">
        <h1 className="text-3xl font-bold text-white mb-2">Weekly Tasks Table</h1>
        <p className="text-slate-400">
          View all contents of the weekly_tasks table
        </p>
      </div>
      
      <div className="p-6 max-w-7xl mx-auto">
        <WeeklyTasksTable />
      </div>
    </div>
  )
}

export default DispenserTasks