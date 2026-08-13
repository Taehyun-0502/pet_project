import { Link } from 'react-router-dom'

/**
 * 마이페이지 — 펫 정보 탭. **아직 자리표시자다.**
 *
 * 탭 구조(F1)를 먼저 세우면서 라우트만 잡아 뒀고, 목록·수정·삭제 진입은 F5에서 채운다
 * (docs/plan-2026-08-13.md). 백엔드 변경은 필요 없다 — pet 조회·수정·삭제 API는 이미 있다.
 *
 * 빈 화면 대신 홈 링크를 두는 이유: 지금도 홈에서 반려동물을 관리할 수 있으므로
 * 여기서 막다른 길을 만들지 않는다.
 */
export default function MyPagePets() {
  return (
    <section>
      <h2>펫 정보</h2>
      <p className="muted-note">
        반려동물 목록·수정은 준비 중입니다. 지금은 홈에서 관리할 수 있습니다.
      </p>
      <p>
        <Link to="/">← 홈에서 반려동물 보기</Link>
      </p>
    </section>
  )
}
