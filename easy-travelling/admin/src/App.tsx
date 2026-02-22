import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/login'
import { isLoggedIn, getUser } from './utils/auth'
import LayoutWithHeader from './components/LayoutWithHeader'
import AdminLayout from './components/AdminLayout'
import HotelListPage from './pages/hotels/list'
import HotelPublishPage from './pages/hotels/publish'
import AdminManageHotelsPage from './pages/admin/ManageHotels'

function DefaultRedirect() {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <Navigate to={getUser()?.role === 'admin' ? '/admin' : '/hotels'} replace />
}

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={12}
        containerClassName="toast-container"
        toastOptions={{
          className: 'admin-toast',
          duration: 2400,
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<LayoutWithHeader />}>
          <Route index element={<DefaultRedirect />} />
          <Route path="hotels" element={<HotelListPage />} />
          <Route path="hotels/publish" element={<HotelPublishPage />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminManageHotelsPage />} />
        </Route>
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
