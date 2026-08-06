import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deletePet, getPet } from './petApi'
import './pet.css'

// 반려동물 상세 — 수정 진입점과 삭제를 담당한다 (docs/api-spec.md 2절)
export default function PetDetailPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const [pet, setPet] = useState(null)       // null = 불러오는 중
  const [loadError, setLoadError] = useState(null) // 조회 실패 (ApiError)
  const [actionError, setActionError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPet(petId)
      .then((data) => { if (!cancelled) setPet(data) })
      .catch((err) => { if (!cancelled) setLoadError(err) })
    return () => { cancelled = true }
  }, [petId])

  const onDelete = async () => {
    if (!window.confirm(`${pet.name}을(를) 삭제할까요? 목록에서 사라집니다.`)) return
    setActionError('')
    setDeleting(true)
    try {
      await deletePet(petId)
      navigate('/', { replace: true }) // 목록이 다시 마운트되며 갱신된다
    } catch (err) {
      setActionError(err.message)
      setDeleting(false)
    }
  }

  // 없는 id·타인 소유·삭제됨이 모두 404로 오므로 한 문구로 안내한다 (서버가 구분하지 않는다)
  if (loadError) {
    return (
      <main className="pet-page">
        <header className="pet-header">
          <h1>반려동물</h1>
          <Link to="/">← 목록으로</Link>
        </header>
        <p className="submit-error">
          {loadError.code === 'PET_NOT_FOUND'
            ? '찾을 수 없는 반려동물입니다. 삭제되었거나 접근 권한이 없습니다.'
            : loadError.message}
        </p>
      </main>
    )
  }

  if (!pet) {
    return (
      <main className="pet-page">
        <p>불러오는 중…</p>
      </main>
    )
  }

  return (
    <main className="pet-page">
      <header className="pet-header">
        <h1>{pet.name}</h1>
        <Link to="/">← 목록으로</Link>
      </header>

      <dl className="pet-detail">
        <dt>이름</dt>
        <dd>{pet.name}</dd>
        <dt>품종</dt>
        <dd>{pet.breed ?? <span className="muted">미입력</span>}</dd>
        <dt>생년월일</dt>
        <dd>{pet.birthDate ?? <span className="muted">미입력</span>}</dd>
      </dl>

      {actionError && <p className="submit-error">{actionError}</p>}

      <div className="pet-actions">
        <Link className="pet-add" to={`/pets/${petId}/edit`}>수정</Link>
        <button type="button" className="danger" onClick={onDelete} disabled={deleting}>
          {deleting ? '삭제 중…' : '삭제'}
        </button>
      </div>
    </main>
  )
}
