import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ChatRoomCreatePage from './chat/ChatRoomCreatePage'
import ChatRoomListPage from './chat/ChatRoomListPage'
import ChatRoomPage from './chat/ChatRoomPage'
import KakaoCallbackPage from './member/KakaoCallbackPage'
import LoginPage from './member/LoginPage'
import MyPage from './member/MyPage'
import MyPageEdit from './member/MyPageEdit'
import MyPagePets from './member/MyPagePets'
import MyPagePosts from './member/MyPagePosts'
import MyPageProfile from './member/MyPageProfile'
import MyPageSecurity from './member/MyPageSecurity'
import RequireLogin from './member/RequireLogin'
import SignupPage from './member/SignupPage'
import WelcomePage from './member/WelcomePage'
import NotFoundPage from './NotFoundPage'
import AppShell from './AppShell'
import HomeLayout from './home/HomeLayout'
import HomePage from './home/HomePage'
import PetCreatePage from './pet/PetCreatePage'
import PetDetailPage from './pet/PetDetailPage'
import PetEditPage from './pet/PetEditPage'

// 타 슬라이스의 무거운 화면(지도·숏츠·진단 — 합계 수천 줄)은 지연 로드해 첫 진입 번들에서 분리한다.
// 해당 파일은 건드리지 않고 여기서 로드 방식만 바꾼다 (슬라이스 경계 유지, 2026-08-11)
const MapPage = lazy(() => import('./pages/map/MapPage'))
const AiSearchPage = lazy(() => import('./pages/aisearch/AiSearchPage'))
const WalkPage = lazy(() => import('./pages/walk/WalkPage'))
const ShortsFeed = lazy(() => import('./shorts/ShortsFeed'))
const ShortsUploadPage = lazy(() => import('./shorts/ShortsUploadPage'))
const ShortsCreateFlow = lazy(() => import('./shorts/create/ShortsCreateFlow'))
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
        <Route path="/skin" element={<Navigate to="/skin/diagnosis" replace />} />
        <Route path="/skin-diagnosis" element={<Navigate to="/skin/diagnosis" replace />} />
        {/* 하이브리드 수치+자연어 AI 스마트 문진 진단 (URL 직접 진입 전용) */}
        <Route path="/hybrid/diagnosis" element={<HybridDiagnosisPage />} />
        <Route path="/hybrid" element={<Navigate to="/hybrid/diagnosis" replace />} />
        <Route path="/hybrid-diagnosis" element={<Navigate to="/hybrid/diagnosis" replace />} />

        {/* 보호 경로 — 이 블록 안에 추가하면 자동으로 로그인이 요구된다 */}
        <Route element={<RequireLogin />}>
          {/* 앱 셸 — 하단 앱바 + 건강검진 시트를 공유한다 (2026-08-26). 이 안에 넣으면
              화면이 바뀌어도 앱바가 남는다. 채팅방(자체 하단 입력 바)·숏츠(풀스크린)·
              진단·펫 폼은 밖에 둔다 — 하단 UI가 겹치거나 한 가지 일에 집중하는 화면이라 */}
          <Route element={<AppShell />}>
            {/* 홈 레이아웃 — 헤더·기능 스트립은 고정하고 아래만 갈아 끼운다.
                지도·산책이 별도 페이지가 아니라 홈의 하위 뷰가 된다 (URL은 그대로 유지) */}
            <Route element={<HomeLayout />}>
              <Route path="/" element={<HomePage />} />
              {/* 주의: /map·/aisearch·/walk 라우트 계열은 병합에서 유실이 반복돼 왔다
                  (QA F-4) — App.jsx 병합 해결 시 diff로 존재를 반드시 확인할 것 */}
              <Route path="/map" element={<MapPage />} />
              <Route path="/walk" element={<WalkPage />} />
            </Route>
            <Route path="/chat" element={<ChatRoomListPage />} />
            <Route path="/mypage" element={<MyPage />}>
              <Route index element={<MyPageProfile />} />
              <Route path="edit" element={<MyPageEdit />} />
              <Route path="security" element={<MyPageSecurity />} />
              <Route path="pets" element={<MyPagePets />} />
              <Route path="posts" element={<MyPagePosts />} />
              {/* 구 URL 보존 — 탈퇴가 보안 화면 안으로 들어갔다. 남아 있는 링크·북마크가 깨지지 않게 */}
              <Route path="withdraw" element={<Navigate to="/mypage/security" replace />} />
            </Route>
          </Route>
          {/* 아래는 앱바 없는 화면들 — 한 가지 일에 집중하거나 자체 하단 UI가 있다.
              /pets 목록 라우트는 폐지 (2026-08-25) — 목록은 마이페이지 펫 탭(/mypage/pets)이 담당,
              상세 진입은 홈 프로필과 펫 탭에서 */}
          <Route path="/pets/new" element={<PetCreatePage />} />
          <Route path="/pets/:petId" element={<PetDetailPage />} />
          <Route path="/pets/:petId/edit" element={<PetEditPage />} />
          <Route path="/chat/new" element={<ChatRoomCreatePage />} />
          <Route path="/chat/rooms/:roomId" element={<ChatRoomPage />} />
          {/* 숏츠 만들기 — 4페이지 풀스크린 플로우 (숏츠_제작_플로우_구조_가이드.md).
              피드의 (+)가 여기로 온다. 아래 /shorts/new(기존 한 화면 업로드 폼)는 플로우가
              전 단계 완성될 때까지 되돌아갈 곳으로 남겨둔다 — 지우는 것은 그 뒤다 */}
          <Route path="/shorts/create" element={<ShortsCreateFlow />} />
          <Route path="/shorts/new" element={<ShortsUploadPage />} />
          {/* AI 검색 전용 페이지 (루트 CLAUDE.md 검색 통합 Phase, 2026-08-12 확정) —
              ?q= 없으면 검색 홈, 있으면 자동 실행. /map·/walk와 같은 유실 주의 계열이다
              (2026-08-11 병합에서 라우트+import 유실 → 08-12 재복원, QA F-4).
              지도·산책은 위 홈 레이아웃 안으로 옮겼다 (2026-08-26) */}
          <Route path="/aisearch" element={<AiSearchPage />} />
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
