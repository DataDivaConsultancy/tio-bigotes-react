import { useState, useEffect } from 'react'
import { useOnline } from '@/hooks/useOnline'
import { useColaPendiente } from '@/hooks/useColaPendiente'
import { useConfigApp } from '@/hooks/useConfigApp'
import { procesar as procesarColaOffline } from '@/lib/offline/sync'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  Package, Users, ClipboardList, BarChart3, TrendingUp,
  AlertCircle, Upload, Shield, Factory, ShoppingCart,
  Store, BoxesIcon, LogOut, Menu, X, ChevronRight, Home, KeyRound,
  LayoutDashboard, FileText, PackageCheck, AlertTriangle, Database, Settings,
  WifiOff, RefreshCw, CloudOff, Wifi,
} from 'lucide-react'

interface NavItem {
  key: string
  label: string
  icon: React.ElementType
  path: string
  section?: string
}

const navItems: NavItem[] = [
  { key: 'Home', label: 'Inicio', icon: Home, path: '/' },
  { key: 'Productos', label: 'Productos', icon: Package, path: '/productos', section: 'Gestión' },
  { key: 'Empleados', label: 'Empleados', icon: Users, path: '/empleados' },
    { key: 'Roles', label: 'Roles', icon: KeyRound, path: '/roles' },
  { key: 'Operativa', label: 'Control Diario', icon: ClipboardList, path: '/operativa', section: 'Operaciones' },
  { key: 'BI', label: 'Historial / BI', icon: BarChart3, path: '/bi' },
  { key: 'Forecast', label: 'Forecast', icon: TrendingUp, path: '/forecast' },
  { key: 'Pendientes', label: 'Pendientes', icon: AlertCircle, path: '/pendientes' },
  { key: 'CargaVentas', label: 'Subir CSV Ventas', icon: Upload, path: '/carga-ventas', section: 'Datos' },
  { key: 'CargaProductos', label: 'Subir CSV Productos', icon: Database, path: '/carga-productos' },
  { key: 'Auditoria', label: 'Auditoría', icon: Shield, path: '/auditoria' },
  { key: 'ComprasDashboard', label: 'Dashboard Compras', icon: LayoutDashboard, path: '/compras', section: 'Compras' },
  { key: 'Proveedores', label: 'Proveedores', icon: Factory, path: '/proveedores' },
  // ProductosCompra eliminado — unificado en Productos
  { key: 'Locales', label: 'Locales', icon: Store, path: '/locales' },
  { key: 'Stock', label: 'Gestión de Stock', icon: BoxesIcon, path: '/stock' },
  { key: 'Pedidos', label: 'Pedidos', icon: FileText, path: '/compras/pedidos' },
  { key: 'Recepciones', label: 'Recepciones', icon: PackageCheck, path: '/compras/recepciones' },
  { key: 'Incidencias', label: 'Incidencias', icon: AlertTriangle, path: '/compras/incidencias' },
  { key: 'Configuracion', label: 'Configuración', icon: Settings, path: '/configuracion', section: 'Sistema' },
]

export default function Layout() {
  const { user, logout, hasAccess, isSuperadmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const config = useConfigApp()
  const online = useOnline()
  const pendientes = useColaPendiente()
  const [sincronizando, setSincronizando] = useState(false)

  async function syncManual() {
    setSincronizando(true)
    try { await procesarColaOffline() } finally { setSincronizando(false) }
  }

  useEffect(() => {
    if (online && pendientes > 0 && !sincronizando) {
      // Auto-disparo cuando vuelve online y hay cola
      syncManual()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  const visibleItems = navItems.filter(
    (item) => item.key === 'Home' || isSuperadmin || hasAccess(item.key)
  )

  let currentSection = ''

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Banner offline / cola pendiente */}
      {(!online || pendientes > 0) && (
        <div className={`fixed top-0 left-0 right-0 z-[60] py-1.5 text-center text-xs font-medium flex items-center justify-center gap-2 ${!online ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>
          {!online && <><CloudOff size={14} /> Sin conexión — los cambios se guardan en este dispositivo</>}
          {online && pendientes > 0 && (
            <>
              <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Sincronizando…' : `${pendientes} cambio${pendientes === 1 ? '' : 's'} pendientes`}
              {!sincronizando && (
                <button onClick={syncManual} className="underline ml-1">Sincronizar ahora</button>
              )}
            </>
          )}
        </div>
      )}
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64' : 'w-[68px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--sidebar-active))] flex items-center justify-center text-white font-bold text-lg shrink-0">
            {config.app_logo_texto ?? 'TB'}
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <h1 className="font-semibold text-white text-sm leading-tight">{config.app_nombre ?? 'Tío Bigotes'}</h1>
              <p className="text-xs text-white/50">{config.app_subtitulo ?? 'Pro Dashboard'}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleItems.map((item) => {
            const isActive = location.pathname === item.path
            let sectionHeader = null
            if (sidebarOpen && item.section && item.section !== currentSection) {
              currentSection = item.section
              sectionHeader = (
                <p className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-white/30 font-semibold">
                  {item.section}
                </p>
              )
            }
            const Icon = item.icon
            return (
              <div key={item.key}>
                {sectionHeader}
                <button
                  onClick={() => {
                    navigate(item.path)
                    setMobileOpen(false)
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                    ${isActive
                      ? 'bg-[hsl(var(--sidebar-active))] text-white shadow-lg shadow-orange-500/20'
                      : 'text-white/70 hover:text-white hover:bg-white/8'
                    }
                  `}
                  title={!sidebarOpen ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                  {sidebarOpen && isActive && <ChevronRight size={14} className="ml-auto opacity-50" />}
                </button>
              </div>
            )
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium shrink-0">
              {user?.nombre?.charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-white truncate">{user?.nombre}</p>
                <p className="text-xs text-white/40 truncate">{user?.rol}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-background border shadow-sm items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight size={12} className={`transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b bg-card flex items-center px-4 gap-4 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
