import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { deletePet, getPet, uploadPetImage } from './petApi'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
import './pet.css'

// 반려동물 상세 — 수정 진입점·삭제·프로필 사진 업로드를 담당한다 (docs/api-spec.md 2절)
export default function PetDetailPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [pet, setPet] = useState(null)       // null = 불러오는 중
  const [loadError, setLoadError] = useState(null) // 조회 실패 (ApiError)
  // 등록 화면에서 "정보는 등록됐지만 사진만 실패"로 넘어온 경우 그 안내를 이어받는다 (PetCreatePage)
  const [actionError, setActionError] = useState(location.state?.photoError ?? '')
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  // 넘겨받은 안내는 1회성 — 지우지 않으면 새로고침·뒤로가기에서 되살아난다 (백로그 63번과 같은 계열)
  useEffect(() => {
    if (location.state?.photoError) window.history.replaceState({}, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onImageChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setActionError('')
    setUploading(true)
    try {
      // 형식·용량 검증 + 512px 축소 (common/imageUpload — 등록·마이페이지와 같은 규칙)
      const prepared = await prepareImage(file)
      setPet(await uploadPetImage(petId, prepared)) // 응답의 ?v= 덕에 즉시 새 이미지로 갱신된다
    } catch (err) {
      setActionError(err.message)
    } finally {
      setUploading(false)
    }
  }

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

      <div className="pet-photo">
        {pet.profileImageUrl ? (
          <img src={pet.profileImageUrl} alt={`${pet.name} 사진`} />
        ) : (
          <div className="pet-photo-placeholder" aria-hidden="true">🐶</div>
        )}
        {/* label이 숨긴 file input을 연다 — 버튼처럼 보이지만 키보드 접근도 된다 */}
        <label className="pet-photo-upload">
          {uploading ? '업로드 중…' : pet.profileImageUrl ? '사진 변경' : '사진 등록'}
          <input
            type="file" accept={IMAGE_ACCEPT}
            onChange={onImageChange} disabled={uploading}
          />
        </label>
      </div>

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
