import Home from './routes/home'
import Footer from './components/footer'
import Protected from './components/protected'
import NotFoundPage from './routes/error/not-found'

import { Navigate } from 'react-router-dom'
import { AuthProvider } from './context/auth-context'
import { AdminLayout } from './components/admin/admin-layout'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'

import { ToastProvider } from './context/toast-context'
import { CartProvider } from './context/cart-context'
import { Spinner } from './components/ui/spinner'
import { GoogleAnalytics } from './components/google-analytics'


const InsightsPage = lazy(() => import('./routes/admin/insights'))
const UsersPage = lazy(() => import('./routes/admin/users'))
const TransactionsPage = lazy(() => import('./routes/admin/transactions'))
const ThemesPage = lazy(() => import('./routes/themes'))
const ThemeDetailPage = lazy(() => import('./routes/theme-detail'))
const CartPage = lazy(() => import('./routes/cart'))
const PurchasesPage = lazy(() => import('./routes/purchases'))
const OrdersPage = lazy(() => import('./routes/orders'))
const CustomerTransactionsPage = lazy(() => import('./routes/transactions'))
const OrderDetailPage = lazy(() => import('./routes/order-detail'))
const CheckoutCancel = lazy(() => import('./routes/checkout-cancel'))
const SignInPage = lazy(() => import('./routes/auth').then((module) => ({ default: module.SignInPage })))
const SignUpPage = lazy(() => import('./routes/auth').then((module) => ({ default: module.SignUpPage })))
const AdminThemesPage = lazy(() => import('./routes/admin/themes'))
const AdminThemeEditorPage = lazy(() => import('./routes/admin/theme-editor'))
const AdminOrdersPage = lazy(() => import('./routes/admin/orders'))
const AdminOrderDetailPage = lazy(() => import('./routes/admin/order-detail'))
const PromotionsPage = lazy(() => import('./routes/admin/promotions'))
const PrivacyPage = lazy(() => import('./routes/privacy'))
const TermsPage = lazy(() => import('./routes/terms'))
const RefundPage = lazy(() => import('./routes/refund'))
const AboutPage = lazy(() => import('./routes/about'))
const ContactPage = lazy(() => import('./routes/contact'))
const AdminContentPage = lazy(() => import('./routes/admin/content'))
const AdminDiscountsPage = lazy(() => import('./routes/admin/discounts'))
const ThemePreviewPage = lazy(() => import('./routes/theme-preview'))

function SiteFooter() {
  const location = useLocation()
  if (location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/admin') || location.pathname.startsWith('/sign-in') || location.pathname.startsWith('/sign-up')) return null
  if (location.pathname.includes('/preview')) return null
  return <Footer />
}


function App() {
  return (
    <BrowserRouter>
      <GoogleAnalytics />
      <AuthProvider>
        <ToastProvider><CartProvider>
          <Suspense fallback={<div className="page-loader"><Spinner size="md" /></div>}><Routes>
            <Route index path='/' element={<Home />} />
            <Route path='/profile' element={<Protected><Navigate to="/" replace /></Protected>} />
            <Route path='/subscription' element={<Protected><Navigate to="/" replace /></Protected>} />
            <Route path='/themes' element={<ThemesPage />} />
            <Route path='/themes/:slug/preview' element={<ThemePreviewPage />} />
            <Route path='/themes/:slug' element={<ThemeDetailPage />} />
            <Route path='/about' element={<AboutPage />} />
            <Route path='/contact' element={<ContactPage />} />
            <Route path='/privacy' element={<PrivacyPage />} />
            <Route path='/terms' element={<TermsPage />} />
            <Route path='/refund' element={<RefundPage />} />
            <Route path='/sign-in/*' element={<SignInPage />} />
            <Route path='/sign-up/*' element={<SignUpPage />} />
            <Route path='/cart' element={<Protected><CartPage /></Protected>} />
            <Route path='/purchases' element={<Protected customerOnly><PurchasesPage /></Protected>} />
            <Route path='/purchase' element={<Protected customerOnly><PurchasesPage /></Protected>} />
            <Route path='/orders' element={<Protected customerOnly><OrdersPage /></Protected>} />
            <Route path='/orders/:id' element={<Protected customerOnly><OrderDetailPage /></Protected>} />
            <Route path='/transactions' element={<Protected customerOnly><CustomerTransactionsPage /></Protected>} />
            <Route path='/checkout/cancel' element={<Protected><CheckoutCancel /></Protected>} />
            <Route path='/dashboard' element={<Protected adminOnly><AdminLayout /></Protected>}>
              <Route index element={<Navigate to="insights" replace />} />
              <Route path='insights' element={<InsightsPage />} />
              <Route path='users' element={<UsersPage />} />
              <Route path='transactions' element={<TransactionsPage />} />
              <Route path='themes' element={<AdminThemesPage />} />
              <Route path='themes/new' element={<AdminThemeEditorPage />} />
              <Route path='theme/new' element={<AdminThemeEditorPage />} />
              <Route path='themes/:id/edit' element={<AdminThemeEditorPage />} />
              <Route path='content' element={<AdminContentPage />} />
              <Route path='orders' element={<AdminOrdersPage />} />
              <Route path='orders/:id' element={<AdminOrderDetailPage />} />
              <Route path='discounts' element={<AdminDiscountsPage />} />
              <Route path='promotions' element={<PromotionsPage />} />
            </Route>
            <Route path='/admin/*' element={<Navigate to="/dashboard/insights" replace />} />
            <Route path='*' element={<NotFoundPage />} />
          </Routes><SiteFooter /></Suspense>
        </CartProvider></ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
