import { Link } from 'react-router-dom'
import './common/forms.css'

// 존재하지 않는 경로의 폴백 (백로그 48번 — 이전에는 완전한 빈 화면이었다).
// 특정 도메인에 속하지 않는 앱 레벨 화면이라 src/ 바로 아래 (App.jsx와 같은 기준)
export default function NotFoundPage() {
  return (
    <main className="auth-page">
      <h1>페이지를 찾을 수 없습니다</h1>
      <p className="muted-note">주소가 잘못되었거나 더 이상 존재하지 않는 페이지입니다.</p>
      <p className="auth-switch">
        <Link to="/">← 홈으로</Link>
      </p>
    </main>
  )
}
