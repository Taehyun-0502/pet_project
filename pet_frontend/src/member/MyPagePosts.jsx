import { Link } from 'react-router-dom'

/**
 * 마이페이지 — 내 게시물(릴스) 탭. **아직 자리표시자다.**
 *
 * 탭 구조(F1)를 먼저 세우면서 라우트만 잡아 뒀다. 목록·정렬(최신순·인기순)·삭제는 F8에서 채우는데,
 * 필요한 API 3건이 전부 shorts 슬라이스라 **담당자 협의가 선행**이다
 * (docs/plan-2026-08-13.md 부록 A). 이 파일 자체는 1번 슬라이스 소관이다.
 */
export default function MyPagePosts() {
  return (
    <section>
      <h2>내 게시물</h2>
      <p className="muted-note">
        내가 올린 릴스 목록은 준비 중입니다.
      </p>
      <p>
        <Link to="/shorts">← 릴스 피드 보기</Link>
      </p>
    </section>
  )
}
