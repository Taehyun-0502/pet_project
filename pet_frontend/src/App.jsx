import { Routes, Route } from 'react-router-dom'
import ChatRoomListPage from './chat/ChatRoomListPage'
import ChatRoomPage from './chat/ChatRoomPage'
import LoginPage from './member/LoginPage'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import PetCreatePage from './pet/PetCreatePage'
import PetDetailPage from './pet/PetDetailPage'
import PetEditPage from './pet/PetEditPage'
import PetListPage from './pet/PetListPage'
import SkinDiagnosisPage from './skin/SkinDiagnosisPage'
import HybridDiagnosisPage from './hybrid/HybridDiagnosisPage'

// 경로 → 페이지 연결. 보호가 필요한 화면은 RequireLogin으로 감싼다
function App() {
  return (
    <Routes>
      {/* 강아지 피부병 12종 AI 진단 페이지 라우트 (URL 직접 접근 가능) */}
      <Route path="/skin/diagnosis" element={<SkinDiagnosisPage />} />
      
      {/* 하이브리드 수치+자연어 AI 스마트 문진 진단 페이지 라우트 (URL 직접 진입 전용) */}
      <Route path="/hybrid/diagnosis" element={<HybridDiagnosisPage />} />

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
      <Route
        path="/pets/:petId"
        element={
          <RequireLogin>
            <PetDetailPage />
          </RequireLogin>
        }
      />
      <Route
        path="/pets/:petId/edit"
        element={
          <RequireLogin>
            <PetEditPage />
          </RequireLogin>
        }
      />
      <Route
        path="/chat"
        element={
          <RequireLogin>
            <ChatRoomListPage />
          </RequireLogin>
        }
      />
      <Route
        path="/chat/rooms/:roomId"
        element={
          <RequireLogin>
            <ChatRoomPage />
          </RequireLogin>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
    </Routes>
  )
}

export default App
