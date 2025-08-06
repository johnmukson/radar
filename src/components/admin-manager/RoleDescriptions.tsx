
import React from 'react'

const RoleDescriptions = () => {
  return (
    <div className="bg-muted p-4 rounded-lg">
      <h3 className="font-semibold mb-2">Role Descriptions:</h3>
      <div className="text-sm text-muted-foreground space-y-1">
        <p><strong>User:</strong> Can view stock lists within their assigned branch.</p>
        <p><strong>Admin:</strong> Can manage stock, assignments, and tasks within their assigned branch.</p>
        <p><strong>Regional Manager:</strong> Can view and manage all branches across the entire region.</p>
      </div>
    </div>
  )
}

export default RoleDescriptions
