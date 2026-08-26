import { NavLink, Outlet, useLocation } from 'react-router-dom'
import '../common/forms.css'
import '../common/warm.css'
import './member.css'

/**
 * 마이페이지 레이아웃 — 탭 네비 + 자식 화면(<Outlet>).
 * 웜톤 템플릿 전환 (2026-08-26) — 구 흑백 스킨 의존을 끊고 warm.css 공용 클래스 +
 * member.css의 .mypage 스코프만 쓴다. 탭·라우트 구조와 로직은 전환 전과 동일.
 *
 * 탭은 3개(내 정보·펫 정보·내 게시물)이고, **정보 수정·보안은 탭이 아니라 "내 정보"에서
 * 버튼으로 들어가는 하위 화면**이다 (2026-08-13 확정, docs/plan-2026-08-13.md F1).
 * 회원 탈퇴는 독립 탭이 아니라 보안 화면 안에 들어간다 — 구 `/mypage/withdraw`는
 * App.jsx에서 보안으로 리다이렉트하므로 남아 있는 링크가 깨지지 않는다.
 *
 * 탭을 useState가 아니라 **URL(중첩 라우트)**로 두는 이유: 새로고침·뒤로가기에서 탭이 유지되고,
 * 특정 탭을 링크로 공유할 수 있다. 방문 목적이 대부분 단일 작업(비밀번호만·펫만)이라
 * 목적 화면으로 바로 가는 구조가 스크롤 나열보다 맞다.
 */

// "내 정보" 탭이 아닌 탭들의 경로. 여기 없는 /mypage/* 는 전부 "내 정보" 계열로 본다 —
// 정보 수정(/mypage/edit)·보안(/mypage/security)처럼 탭 네비에 없는 하위 화면에서도
// "내 정보" 탭이 켜져 있어야 사용자가 자기 위치를 잃지 않는다.
// 화이트리스트(내 정보 계열을 나열)가 아니라 블랙리스트인 이유: 하위 화면이 늘어도 이 목록은 그대로다
const OTHER_TAB_PREFIXES = ['/mypage/pets', '/mypage/posts']

export default function MyPage() {
  const { pathname } = useLocation()
  const infoActive = !OTHER_TAB_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  return (
    <main className="warm mypage">
      {/* "← 홈으로" 링크는 제거 (2026-08-26) — 셸의 브랜드 헤더(댕댕댕)와 하단 앱바가 그 몫을 한다 */}
      <header className="w-top">
        <h1>마이페이지</h1>
      </header>
      <nav className="mypage-tabs">
        {/* NavLink의 자동 active 대신 직접 계산한다 (위 주석).
            className을 **함수로** 주는 것이 핵심이다 — 문자열로 주면 NavLink가 자기 판단의
            'active'를 뒤에 덧붙이는데, `end`가 없는 "/mypage"는 하위 경로 전부에 매칭돼
            /mypage/pets에서도 이 탭이 함께 켜진다(실측으로 확인). 함수는 반환값이 그대로 쓰인다 */}
        <NavLink to="/mypage" className={() => (infoActive ? 'active' : '')}>내 정보</NavLink>
        <NavLink to="/mypage/pets">펫 정보</NavLink>
        <NavLink to="/mypage/posts">내 게시물</NavLink>
      </nav>
      <div className="w-card">
        <Outlet />
      </div>
    </main>
  )
}
