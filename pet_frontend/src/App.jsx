import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import ChatRoomListPage from './chat/ChatRoomListPage'
import ChatRoomPage from './chat/ChatRoomPage'
import KakaoCallbackPage from './member/KakaoCallbackPage'
import LoginPage from './member/LoginPage'
import MyPage from './member/MyPage'
import MyPageProfile from './member/MyPageProfile'
import MyPageSecurity from './member/MyPageSecurity'
import MyPageWithdraw from './member/MyPageWithdraw'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import WelcomePage from './member/WelcomePage'
import NotFoundPage from './NotFoundPage'
import PetCreatePage from './pet/PetCreatePage'
import PetDetailPage from './pet/PetDetailPage'
import PetEditPage from './pet/PetEditPage'
import PetListPage from './pet/PetListPage'

// 타 슬라이스의 무거운 화면(지도·숏츠·진단 — 합계 수천 줄)은 지연 로드해 첫 진입 번들에서 분리한다.
// 해당 파일은 건드리지 않고 여기서 로드 방식만 바꾼다 (슬라이스 경계 유지, 2026-08-11)
const MapPage = lazy(() => import('./pages/map/MapPage'))
const ShortsFeed = lazy(() => import('./shorts/ShortsFeed'))
const ShortsUploadPage = lazy(() => import('./shorts/ShortsUploadPage'))
const SkinDiagnosisPage = lazy(() => import('./skin/SkinDiagnosisPage'))
const HybridDiagnosisPage = lazy(() => import('./hybrid/HybridDiagnosisPage'))

// 경로 → 페이지 연결. 보호 화면은 RequireLogin 레이아웃 라우트 아래 — 개별 래핑을 반복하지 않는다
function App() {
  return (
    <Suspense fallback={<main><p>불러오는 중…</p></main>}>
      <Routes>
        {/* 공개 경로 */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {/* 카카오 인가 리다이렉트 수신 — 로그인 전 상태에서 진입한다 */}
        <Route path="/oauth/kakao" element={<KakaoCallbackPage />} />
        {/* 피드 조회는 공개(서버도 GET /api/shorts만 permitAll), 업로드는 아래 보호 구역.
            비로그인의 좋아요·댓글은 ShortsFeed 내부에서 /login으로 보낸다 */}
        <Route path="/shorts" element={<ShortsFeed />} />
        {/* 강아지 피부병 12종 AI 진단 (URL 직접 접근 가능) */}
        <Route path="/skin/diagnosis" element={<SkinDiagnosisPage />} />
        {/* 하이브리드 수치+자연어 AI 스마트 문진 진단 (URL 직접 진입 전용) */}
        <Route path="/hybrid/diagnosis" element={<HybridDiagnosisPage />} />

        {/* 보호 경로 — 이 블록 안에 추가하면 자동으로 로그인이 요구된다 */}
        <Route element={<RequireLogin />}>
          <Route path="/" element={<PetListPage />} />
          <Route path="/pets/new" element={<PetCreatePage />} />
          <Route path="/pets/:petId" element={<PetDetailPage />} />
          <Route path="/pets/:petId/edit" element={<PetEditPage />} />
          {/* 마이페이지 — 탭이 곧 URL인 중첩 라우트 (MyPage.jsx가 탭 네비 + Outlet 레이아웃) */}
          <Route path="/mypage" element={<MyPage />}>
            <Route index element={<MyPageProfile />} />
            <Route path="security" element={<MyPageSecurity />} />
            <Route path="withdraw" element={<MyPageWithdraw />} />
          </Route>
          <Route path="/chat" element={<ChatRoomListPage />} />
          <Route path="/chat/rooms/:roomId" element={<ChatRoomPage />} />
          <Route path="/shorts/new" element={<ShortsUploadPage />} />
          {/* 지도 + AI 장소 추천 (루트 CLAUDE.md 지도 Phase). 주의: 이 라우트는 병합 시
              두 차례(035375f, 0c5ea7e) 유실된 이력이 있다 — App.jsx 병합 해결 시 diff로
              /map 존재를 반드시 확인할 것 (QA F-4) */}
          <Route path="/map" element={<MapPage />} />
          {/* 가입 직후 온보딩 — 진입은 SignupPage가 넘긴 state로만 허용 (WelcomePage 내부 처리) */}
          <Route path="/welcome" element={<WelcomePage />} />
        </Route>

        {/* 폴백 — 존재하지 않는 경로 (백로그 48번: 이전에는 완전한 빈 화면) */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
