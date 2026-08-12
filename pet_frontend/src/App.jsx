import { Routes, Route } from 'react-router-dom'
import ChatRoomListPage from './chat/ChatRoomListPage'
import ChatRoomPage from './chat/ChatRoomPage'
import KakaoCallbackPage from './member/KakaoCallbackPage'
import LoginPage from './member/LoginPage'
import MyPage from './member/MyPage'
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
        path="/mypage"
        element={
          <RequireLogin>
            <MyPage />
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
      {/* AI 검색 진입 경로 — 검색 통합 Phase(루트 CLAUDE.md): AI 검색은 챗봇(지도)
          페이지가 담당하므로 MapPage를 그대로 렌더링한다(별도 페이지 없음).
          추후 ?q= 쿼리 파라미터 수신 시 자동 검색 실행 예정(미구현) */}
      <Route
        path="/aisearch"
        element={
          <RequireLogin>
            <MapPage />
          </RequireLogin>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* 카카오 인가 리다이렉트 수신 — 공개 경로 (로그인 전 상태에서 진입한다) */}
      <Route path="/oauth/kakao" element={<KakaoCallbackPage />} />
    </Routes>
  )
}

export default App
