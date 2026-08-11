import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { resizeImage } from '../common/imageResize'
import { deletePet, getPet, uploadPetImage } from './petApi'
import './pet.css'

// 반려동물 상세 — 수정 진입점·삭제·프로필 사진 업로드를 담당한다 (docs/api-spec.md 2절)
export default function PetDetailPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const [pet, setPet] = useState(null)       // null = 불러오는 중
  const [loadError, setLoadError] = useState(null) // 조회 실패 (ApiError)
  const [actionError, setActionError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const onImageChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setActionError('')
    // 서버(PetService.validateImage)와 같은 규칙의 1차 검증 — 5MB 파일을 보내고 나서 거절당하지 않게
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setActionError('jpeg·png·webp 이미지만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionError('이미지는 5MB 이하여야 합니다.')
      return
    }
    setUploading(true)
    try {
      // 업로드 전 512px 축소 — 원본이 아바타·썸네일 조회마다 내려가는 것을 막는다 (imageResize.js)
      const resized = await resizeImage(file)
      setPet(await uploadPetImage(petId, resized)) // 응답의 ?v= 덕에 즉시 새 이미지로 갱신된다
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
            type="file" accept="image/jpeg,image/png,image/webp"
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
