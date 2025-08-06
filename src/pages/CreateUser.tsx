import React, { useEffect } from 'react'
import UserCreation from '@/components/UserCreation'
import { useUserRole } from '@/hooks/useUserRole'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const CreateUser = () => {
  const { user } = useAuth()
  const { hasAdminAccess, loading } = useUserRole()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !hasAdminAccess) {
      navigate('/not-found') // or show an access denied message
    }
  }, [loading, hasAdminAccess, navigate])

  if (loading || !hasAdminAccess) return null // or a loading spinner

  return <UserCreation />
}

export default CreateUser
