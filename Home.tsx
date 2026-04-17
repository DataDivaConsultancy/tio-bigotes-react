import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import {
  Package, Users, ClipboardList, BarChart3, TrendingUp,
  AlertCircle, Upload, Shield, Factory, ShoppingCart,
  Store, BoxesIcon,
} from 'lucide-react'

const quickLinks = [
  { key: 'Operativa', label: 'Control Diario', icon: ClipboardList, path: '/operativa', color: 'bg-blue-500', desc: 'Producción y control del día' },
  { key: 'Productos', label: 'Productos', icon: Package, path: '/productos', color: 'bg-emerald-500', desc: 'Gestión de catálogo' },
  { key: 'Empleados', label: 'Empleados', icon: Users, path: '/empleados', color: 'bg-violet-500', desc: 'Equipo y permisos' },
  { key: 'BI', label: 'Historial / BI', icon: BarChart3, path: '/bi', color: 'bg-amber-500', desc: 'Análisis de ventas' },
  { key: 'Forecast', label: 'Forecast', icon: TrendingUp, path: '/forecast', color: 'bg-rose-500', desc: 'Previsión de demanda' },
  { key: 'Pendientes', label: 'Pendientes', icon: AlertCircle, path: '/pendientes', color: 'bg-orange-500', desc: 'Artículos pendientes' },
  { key: 'CargaVentas', label: 'Subir CSV', icon: Upload, path: '/carga-ventas', color: 'bg-cyan-500', desc: 'Importar ventas' },
  { key: 'Auditoria', label: 'Auditoría', icon: Shield, path: '/auditoria', color: 'bg-slate-500', desc: 'Registro de actividad' },
  { key: 'Proveedores', label: 'Proveedores', icon: Factory, path: '/proveedores', color: 'bg-teal-500', desc: 'Gestión de proveedores' },
  { key: 'ProductosCompra', label: 'Productos Compra', icon: ShoppingCart, path: '/productos-compra', color: 'bg-indigo-500', desc: 'Catálogo de compras' },
  { key: 'Locales', label: 'Locales', icon: Store, path: '/locales', color: 'bg-pink-500', desc: 'Puntos de venta' },
  { key: 'Stock', label: 'Stock', icon: BoxesIcon, path: '/stock', color: 'bg-lime-600', desc: 'Inventario y movimientos' },
]

export default function Home() {
  const { user, hasAccess, isSuperadmin } = useAuth()
  const navigate = useNavigate()

  const visible = quickLinks.filter((l) => isSuperadmin || hasAccess(l.key))

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hola, {user?.nombre?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Bienvenido al panel de gestión de Tío Bigotes
        </p>
      </div>

      {/* Quick links grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {visible.map((link) => {
          const Icon = link.icon
          return (
            <Card
              key={link.key}
              className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
              onClick={() => navigate(link.path)}
            >
              <CardContent className="p-5">
                <div className={`w-10 h-10 rounded-xl ${link.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <Icon size={20} className="text-white" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">{link.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{link.desc}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
