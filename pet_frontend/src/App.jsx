import { Routes, Route } from 'react-router-dom'
import LoginPage from './member/LoginPage'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import PetCreatePage from './pet/PetCreatePage'
import PetListPage from './pet/PetListPage'

// 경로 → 페이지 연결. 보호가 필요한 화면은 RequireLogin으로 감싼다
function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireLogin>
            <PetListPage />
          </RequireLogin>
        }
      />
      <Route
        path="/pets/new"
        element={
          <RequireLogin>
            <PetCreatePage />
          </RequireLogin>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
    </Routes>
  )
}

export default App
