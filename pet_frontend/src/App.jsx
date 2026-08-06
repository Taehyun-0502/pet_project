import { Routes, Route } from 'react-router-dom'
import HomePage from './HomePage'
import LoginPage from './member/LoginPage'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import MapPage from './pages/map/MapPage'

// 경로 → 페이지 연결. 보호가 필요한 화면은 RequireLogin으로 감싼다
function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireLogin>
            <HomePage />
          </RequireLogin>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/map"
        element={
          <RequireLogin>
            <MapPage />
          </RequireLogin>
        }
      />
    </Routes>
  )
}

export default App
