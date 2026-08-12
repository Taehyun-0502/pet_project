import { Link, NavLink, Outlet } from 'react-router-dom'
import '../common/forms.css'
import './member.css'

/**
 * 마이페이지 레이아웃 — 탭 네비 + 자식 탭(<Outlet>). 실제 내용은 탭별 파일에 있다:
 * MyPageProfile(내 정보) · MyPageSecurity(보안 — 비밀번호·기기) · MyPageWithdraw(탈퇴).
 *
 * 한 파일에 4개 섹션의 무관한 상태가 섞여 360줄이 되어 탭 단위로 분리했다 (2026-08-11).
 * 탭을 useState가 아니라 **URL(중첩 라우트)**로 두는 이유: 새로고침·뒤로가기에서 탭이 유지되고,
 * 특정 탭을 링크로 공유할 수 있다. 방문 목적이 대부분 단일 작업(비밀번호만·기기만)이라
 * 목적 탭으로 바로 가는 구조가 스크롤 나열보다 맞고, 탈퇴(위험 영역)도 격리된다.
 */
export default function MyPage() {
  return (
    <main className="auth-page">
      <h1>마이페이지</h1>
      <nav className="mypage-tabs">
        {/* end: "/mypage"가 자식 경로에서도 active로 남지 않게 정확 일치만 */}
        <NavLink to="/mypage" end>내 정보</NavLink>
        <NavLink to="/mypage/security">보안</NavLink>
        <NavLink to="/mypage/withdraw">회원 탈퇴</NavLink>
      </nav>
      <Outlet />
      <p className="auth-switch">
        <Link to="/">← 홈으로</Link>
      </p>
    </main>
  )
}
