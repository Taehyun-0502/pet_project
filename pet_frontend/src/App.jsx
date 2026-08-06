import { Routes, Route } from 'react-router-dom'
import ChatRoomListPage from './chat/ChatRoomListPage'
import ChatRoomPage from './chat/ChatRoomPage'
import LoginPage from './member/LoginPage'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import MapPage from './pages/map/MapPage'
import PetCreatePage from './pet/PetCreatePage'
import PetDetailPage from './pet/PetDetailPage'
import PetEditPage from './pet/PetEditPage'
import PetListPage from './pet/PetListPage'
import ShortsFeed from './shorts/ShortsFeed'
import ShortsUploadPage from './shorts/ShortsUploadPage'
import SkinDiagnosisPage from './skin/SkinDiagnosisPage'

// 경로 → 페이지 연결. 보호가 필요한 화면은 RequireLogin으로 감싼다
function App() {
  return (
    <Routes>
      {/* 강아지 피부병 12종 AI 진단 페이지 라우트 (URL مستقیم 접근 가능) */}
      <Route path="/skin/diagnosis" element={<SkinDiagnosisPage />} />
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
      {/* 피드 조회는 공개 (서버도 GET /api/shorts만 permitAll), 업로드는 로그인 필요.
          비로그인도 피드를 볼 수 있어야 하므로 RequireLogin으로 감싸지 않는다 —
          그 경우 좋아요·댓글은 누르면 /login으로 보낸다 (ShortsFeed 내부 처리) */}
      <Route path="/shorts" element={<ShortsFeed />} />
      <Route
        path="/shorts/new"
        element={
          <RequireLogin>
            <ShortsUploadPage />
          </RequireLogin>
        }
      />
      {/* 지도 + AI 장소 추천 (루트 CLAUDE.md 지도 Phase). 주의: 이 라우트는 병합 시
          두 차례(035375f, 0c5ea7e) 유실된 이력이 있다 — App.jsx 병합 해결 시 diff로
          /map 존재를 반드시 확인할 것 (QA F-4) */}
      <Route
        path="/map"
        element={
          <RequireLogin>
            <MapPage />
          </RequireLogin>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
    </Routes>
  )
}

export default App
