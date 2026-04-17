import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  children: React.ReactNode
  screen?: string
}

export default function ProtectedRoute({ children, screen }: Props) {
  const { user, loading, hasAccess } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (screen && !hasAccess(screen)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <div className="text-4xl">🔒</div>
        <p className="text-lg font-medium">No tienes acceso a esta sección</p>
        <p className="text-sm">Contacta con el administrador para obtener permisos.</p>
      </div>
    )
  }

  return <>{children}</>
}
