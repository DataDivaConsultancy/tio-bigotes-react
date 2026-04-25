import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
import Home from '@/pages/Home'
import Productos from '@/pages/Productos'
import Empleados from '@/pages/Empleados'
import Operativa from '@/pages/Operativa'
import BI from '@/pages/BI'
import Forecast from '@/pages/Forecast'
import Pendientes from '@/pages/Pendientes'
import CargaVentas from '@/pages/CargaVentas'
import Auditoria from '@/pages/Auditoria'
import Proveedores from '@/pages/compras/Proveedores'
import ProductosCompra from '@/pages/compras/ProductosCompra'
import Locales from '@/pages/compras/Locales'
import Stock from '@/pages/compras/Stock'

function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
