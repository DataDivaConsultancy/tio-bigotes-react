import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
import Home from '@/pages/Home'
import Productos from '@/pages/Productos'
import Empleados from '@/pages/Empleados'
import RolesPage from '@/pages/Roles'
import CambiarPassword from '@/pages/CambiarPassword'
import ConfiguracionPage from '@/pages/Configuracion'
import Operativa from '@/pages/Operativa'
import BI from '@/pages/BI'
import Forecast from '@/pages/Forecast'
import Pendientes from '@/pages/Pendientes'
import CargaVentas from '@/pages/CargaVentas'
import CargaProductos from '@/pages/CargaProductos'
import Auditoria from '@/pages/Auditoria'
import Proveedores from '@/pages/compras/Proveedores'
import ProductosCompra from '@/pages/compras/ProductosCompra'
import Locales from '@/pages/compras/Locales'
import Stock from '@/pages/compras/Stock'
// Módulo de Compras v2 (MVP1)
import ComprasDashboard from '@/pages/compras/Dashboard'
import ListaPedidos from '@/pages/compras/pedidos/Lista'
import CrearPedido from '@/pages/compras/pedidos/Crear'
import DetallePedido from '@/pages/compras/pedidos/Detalle'
import AprobacionesPedidos from '@/pages/compras/pedidos/Aprobaciones'
import ListaRecepciones from '@/pages/compras/recepciones/Lista'
import DetalleRecepcion from '@/pages/compras/recepciones/Detalle'
import ListaIncidencias from '@/pages/compras/incidencias/Lista'
import DetalleIncidencia from '@/pages/compras/incidencias/Detalle'
// Fase 2 (placeholders)
import ListaAlbaranes from '@/pages/compras/albaranes/Lista'
import ListaFacturas from '@/pages/compras/facturas/Lista'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/cambiar-password" element={<CambiarPassword />} />

      {/* Protected */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Home />} />

        {/* Gestión */}
        <Route
          path="/productos"
          element={
            <ProtectedRoute screen="Productos">
              <Productos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/empleados"
          element={
            <ProtectedRoute screen="Empleados">
              <Empleados />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute screen="Roles">
              <RolesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/configuracion"
          element={
            <ProtectedRoute screen="Configuracion">
              <ConfiguracionPage />
            </ProtectedRoute>
          }
        />

        {/* Operaciones */}
        <Route
          path="/operativa"
          element={
            <ProtectedRoute screen="Operativa">
              <Operativa />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bi"
          element={
            <ProtectedRoute screen="BI">
              <BI />
            </ProtectedRoute>
          }
        />
        <Route
          path="/forecast"
          element={
            <ProtectedRoute screen="Forecast">
              <Forecast />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pendientes"
          element={
            <ProtectedRoute screen="Pendientes">
              <Pendientes />
            </ProtectedRoute>
          }
        />

        {/* Datos */}
        <Route
          path="/carga-ventas"
          element={
            <ProtectedRoute screen="CargaVentas">
              <CargaVentas />
            </ProtectedRoute>
          }
        />
        <Route
          path="/carga-productos"
          element={
            <ProtectedRoute screen="CargaProductos">
              <CargaProductos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute screen="Auditoria">
              <Auditoria />
            </ProtectedRoute>
          }
        />

        {/* Compras */}
        <Route
          path="/proveedores"
          element={
            <ProtectedRoute screen="Proveedores">
              <Proveedores />
            </ProtectedRoute>
          }
        />
        <Route
          path="/productos-compra"
          element={
            <ProtectedRoute screen="ProductosCompra">
              <ProductosCompra />
            </ProtectedRoute>
          }
        />
        <Route
          path="/locales"
          element={
            <ProtectedRoute screen="Locales">
              <Locales />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute screen="Stock">
              <Stock />
            </ProtectedRoute>
          }
        />

        {/* Módulo de Compras v2 — MVP1 */}
        <Route
          path="/compras"
          element={
            <ProtectedRoute screen="ComprasDashboard">
              <ComprasDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/pedidos"
          element={
            <ProtectedRoute screen="Pedidos">
              <ListaPedidos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/pedidos/nuevo"
          element={
            <ProtectedRoute screen="Pedidos">
              <CrearPedido />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/pedidos/aprobaciones"
          element={
            <ProtectedRoute screen="Pedidos">
              <AprobacionesPedidos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/pedidos/:id"
          element={
            <ProtectedRoute screen="Pedidos">
              <DetallePedido />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/recepciones"
          element={
            <ProtectedRoute screen="Recepciones">
              <ListaRecepciones />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/recepciones/:id"
          element={
            <ProtectedRoute screen="Recepciones">
              <DetalleRecepcion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/incidencias"
          element={
            <ProtectedRoute screen="Incidencias">
              <ListaIncidencias />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/incidencias/:id"
          element={
            <ProtectedRoute screen="Incidencias">
              <DetalleIncidencia />
            </ProtectedRoute>
          }
        />

        {/* Compras — Fase 2 (placeholders) */}
        <Route
          path="/compras/albaranes"
          element={
            <ProtectedRoute screen="Albaranes">
              <ListaAlbaranes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compras/facturas"
          element={
            <ProtectedRoute screen="FacturasCompra">
              <ListaFacturas />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
