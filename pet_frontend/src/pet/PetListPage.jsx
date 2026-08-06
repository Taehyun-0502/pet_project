import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../member/AuthContext'
import { getMyPets } from './petApi'
import './pet.css'

// 내 반려동물 목록 — 앱의 홈 화면 (구 HomePage 자리)
export default function PetListPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pets, setPets] = useState(null) // null = 아직 불러오는 중
  const [error, setError] = useState('')

  useEffect(() => {
    getMyPets()
      .then(setPets)
      .catch((err) => setError(err.message))
  }, [])

  // 서버 폐기까지 끝난 뒤 이동한다 — 먼저 나가면 쿠키가 남은 채 화면만 바뀔 수 있다
  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="pet-page">
      <header className="pet-header">
        <h1>내 반려동물</h1>
        <div className="who">
          <span>{user.name}님</span>
          <button type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <nav className="pet-nav">
        <Link className="pet-add" to="/pets/new">
          + 반려동물 등록
        </Link>
        <Link to="/chat">오픈채팅 →</Link>
      </nav>

      {error && <p className="submit-error">{error}</p>}
      {pets === null && !error && <p>불러오는 중…</p>}
      {pets && pets.length === 0 && <p>등록된 반려동물이 없습니다. 첫 반려동물을 등록해 보세요.</p>}
      {pets && pets.length > 0 && (
        <ul className="pet-list">
          {pets.map((pet) => (
            <li key={pet.id}>
              {/* 항목 전체를 링크로 — li에 onClick을 걸면 키보드로 접근할 수 없다 */}
              <Link to={`/pets/${pet.id}`}>
                <strong>{pet.name}</strong>
                <span className="muted">{pet.breed ?? '품종 미입력'}</span>
                <span className="muted">{pet.birthDate ?? '생년월일 미입력'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
