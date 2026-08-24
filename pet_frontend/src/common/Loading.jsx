// 공용 로딩 표시 (백로그 64번) — 세션 복원(restoring)처럼 "아직 판단할 수 없는" 동안 보여준다.
// RequireLogin·LoginPage·SignupPage가 공유한다 — 각자 인라인으로 두면 문구·구조가 화면마다 갈린다
export default function Loading({ message = '불러오는 중…' }) {
  return (
    <main>
      <p>{message}</p>
    </main>
  )
}
