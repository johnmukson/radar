
import React from 'react'

const RoleDescriptions = () => {
  return (
    <div className="bg-muted p-4 rounded-lg">
      <h3 className="font-semibold mb-2">Role Descriptions:</h3>
      <div className="text-sm text-muted-foreground space-y-1">
        <p><strong>Dispenser:</strong> Can view and adjust stock quantities within their assigned branch.</p>
        <p><strong>Doctor:</strong> Can view all data across the system but cannot modify anything (read-only access).</p>
        <p><strong>Admin:</strong> Can manage stock, assignments, and tasks within their assigned branch.</p>
        <p><strong>Regional Manager:</strong> Can view and manage all branches across the entire region.</p>
        <p><strong>Branch System Admin:</strong> Can manage system settings and users within their assigned branch.</p>
        <p><strong>System Admin:</strong> Full system access across all branches and system settings.</p>
      </div>
    </div>
  )
}

export default RoleDescriptions
