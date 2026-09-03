import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

// Auth
import { useAuth } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import Login from './pages/Login'
import SelectRole from './pages/SelectRole'

// Components
import AppShell from './components/AppShell'
import Dashboard from './pages/Dashboard'
import ScanProduct from './pages/ScanProduct'
import Processing from './pages/Processing'
import Result from './pages/Result'
import Report from './pages/Report'
import History from './pages/History'

// Seller
import SellerOnboarding from './pages/SellerOnboarding'
import Profile from './pages/Profile'
import Sell from './pages/Sell'

// Buyer
import Stores from './pages/Stores'
import StoreDetail from './pages/StoreDetail'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'

// Orders (role-aware)
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'

import ReportConcern from './pages/ReportConcern'
import Reports from './pages/Reports'
import ComingSoon from './pages/ComingSoon'



/**
 * Loading spinner shown while auth state is resolving.
 */
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    </div>
  )
}

/**
 * Protected route — redirects to /login if unauthenticated,
 * or to /select-role if no role chosen yet.
 */
function ProtectedRoute({ children }) {
  const { status } = useAuth()

  if (status === 'loading') return <AuthLoading />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (status === 'no-role') return <Navigate to="/select-role" replace />

  return children
}

/**
 * Guest route — redirects authenticated users to dashboard.
 */
function GuestRoute({ children }) {
  const { status } = useAuth()

  if (status === 'loading') return <AuthLoading />
  if (status === 'authenticated') return <Navigate to="/" replace />
  if (status === 'no-role') return <Navigate to="/select-role" replace />

  return children
}

/**
 * Role-selection guard — only accessible when authenticated but roleless.
 */
function RoleSelectRoute({ children }) {
  const { status } = useAuth()

  if (status === 'loading') return <AuthLoading />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (status === 'authenticated') return <Navigate to="/" replace />

  return children
}

/**
 * Seller profile guard — redirects sellers without a profile to /seller-profile.
 */
function SellerProfileGuard({ children }) {
  const { status } = useAuth()

  if (status === 'loading') return <AuthLoading />
  if (status === 'no-seller-profile') return <Navigate to="/seller-profile" replace />

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/select-role"
        element={
          <RoleSelectRoute>
            <SelectRole />
          </RoleSelectRoute>
        }
      />

      {/* Seller onboarding — standalone, no AppShell */}
      <Route
        path="/seller-profile"
        element={
          <ProtectedRoute>
            <SellerOnboarding />
          </ProtectedRoute>
        }
      />

      {/* Protected routes — wrapped in AppShell + SellerProfileGuard */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <SellerProfileGuard>
              <NotificationProvider>
                <AppShell>
                  <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/scan" element={<ScanProduct />} />
                  <Route path="/processing" element={<Processing />} />
                  <Route path="/result" element={<Result />} />
                  <Route path="/report/:id" element={<Report />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/sell" element={<Sell />} />
                  <Route path="/stores" element={<Stores />} />
                  <Route path="/stores/:storeId" element={<StoreDetail />} />
                  <Route path="/stores/:storeId/products/:productId" element={<ProductDetail />} />
                  <Route path="/checkout/:productId" element={<Checkout />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/orders/:orderId" element={<OrderDetail />} />
                  <Route path="/report-concern/:scanId" element={<ReportConcern />} />
                  <Route path="/reports" element={<Reports />} />                  </Routes>
                </AppShell>
              </NotificationProvider>
            </SellerProfileGuard>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
