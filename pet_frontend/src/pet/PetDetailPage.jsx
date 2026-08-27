import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import DeleteConfirm from '../common/DeleteConfirm'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { deletePet, getPet, uploadPetImage } from './petApi'
import '../common/forms.css' // .submit-error 등 공용 안내 스타일 — 전역 우연 의존 대신 명시 import (백로그 54번)
import '../common/warm.css'
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
  const [confirmingDelete, setConfirmingDelete] = useState(false) // 삭제 2단 확인 표시 중
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

  // 확인은 window.confirm이 아니라 버튼 자리의 DeleteConfirm이 담당한다 (2026-08-27 —
  // 대화상자 억제 환경에서 confirm이 조용히 false를 반환해 삭제가 무반응이던 결함)
  const onDelete = async () => {
    setActionError('')
    setDeleting(true)
    try {
      await deletePet(petId)
      // /pets 목록 폐지(2026-08-25) — 삭제 후에는 마이페이지 펫 탭으로
      navigate('/mypage/pets', { replace: true }) // 탭이 다시 마운트되며 갱신된다
    } catch (err) {
      setActionError(err.message)
      setDeleting(false)
    }
  }

  // 없는 id·타인 소유·삭제됨이 모두 404로 오므로 한 문구로 안내한다 (서버가 구분하지 않는다)
  if (loadError) {
    return (
      <main className="warm pet-page">
        <div className="w-top">
          <div className="w-brand">반려동물</div>
          <Link className="w-link" to="/mypage/pets">← 펫 목록으로</Link>
        </div>
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
      <main className="warm pet-page">
        <p className="pet-empty">불러오는 중…</p>
      </main>
    )
  }

  return (
    <main className="warm pet-page">
      <div className="w-top">
        <div className="w-brand">반려동물</div>
        <Link className="w-link" to="/mypage/pets">← 펫 목록으로</Link>
      </div>

      {/* 본문 전체를 흰 라운드 카드 하나로 — 사진·속성·액션이 한 덩어리 (웜톤 카드 문법) */}
      <div className="w-card pet-body">
        <div className="pet-photo">
          {pet.profileImageUrl ? (
            <img src={pet.profileImageUrl} alt={`${pet.name} 사진`} />
          ) : (
            // 사진 없음 — 크림 배경 + 🐶 자리표시
            <div className="pet-photo-placeholder" aria-hidden="true">🐶</div>
          )}
          {/* label이 file input을 연다. 키보드 접근은 input을 pet.css에서 visually-hidden으로만
              숨기기 때문에 성립한다 — display:none으로 바꾸면 Tab으로 도달할 수 없게 된다 (백로그 84번) */}
          <label className="pet-photo-upload">
            {uploading ? '업로드 중…' : pet.profileImageUrl ? '사진 변경' : '사진 등록'}
            <input
              type="file" accept={IMAGE_ACCEPT}
              onChange={onImageChange} disabled={uploading}
            />
          </label>
        </div>

        <h1 className="pet-detail-name">{pet.name}</h1>

        {/* dt/dd 쌍을 div로 묶는다 — 헤어라인 행(라벨 좌 / 값 우) 격자용, dl 안 div는 표준 허용 */}
        <dl className="pet-detail">
          <div>
            <dt>이름</dt>
            <dd>{pet.name}</dd>
          </div>
          <div>
            <dt>품종</dt>
            <dd>{pet.breed ?? <span className="muted">미입력</span>}</dd>
          </div>
          <div>
            <dt>생년월일</dt>
            <dd>{pet.birthDate ?? <span className="muted">미입력</span>}</dd>
          </div>
        </dl>

        {actionError && <p className="submit-error">{actionError}</p>}

        <div className="pet-actions">
          {/* 수정은 코럴 채움(.w-cta) — a 요소 밑줄·색 보정은 pet.css의 .warm a.w-cta */}
          <Link className="w-cta block" to={`/pets/${petId}/edit`}>수정</Link>
          {confirmingDelete ? (
            <DeleteConfirm
              message={`${pet.name}을(를) 삭제할까요? 목록에서 사라집니다.`}
              busy={deleting}
              onConfirm={onDelete}
              onCancel={() => setConfirmingDelete(false)}
            />
          ) : (
            <button type="button" className="w-ghost danger block" onClick={() => setConfirmingDelete(true)}>
              삭제
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
