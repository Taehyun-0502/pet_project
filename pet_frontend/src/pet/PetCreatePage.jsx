import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import { registerPet, uploadPetImage } from './petApi'
import { today, toPetRequest, validatePetForm } from './petForm'
import '../common/forms.css'
import './pet.css'

export default function PetCreatePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', breed: '', birthDate: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 사진은 등록과 동시에 올릴 수 없다 — 업로드 API가 petId를 요구하기 때문(POST /api/pets/{petId}/image).
  // 그래서 선택 시점에는 파일만 준비해 두고, 제출 후 생성된 id로 이어서 올린다 (2026-08-11)
  const [photo, setPhoto] = useState(null) // 축소까지 끝난 업로드용 파일
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [preparing, setPreparing] = useState(false)

  // 미리보기 objectURL 해제 — 교체·이탈 때 정리하지 않으면 메모리에 남는다
  useEffect(() => {
    if (!photoPreview) return undefined
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onPhotoChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setPhotoError('')
    setPreparing(true)
    try {
      // 형식·용량 검증과 512px 축소 (common/imageUpload) — 상세·마이페이지와 같은 규칙
      const prepared = await prepareImage(file)
      setPhoto(prepared)
      setPhotoPreview(URL.createObjectURL(prepared))
    } catch (err) {
      setPhoto(null)
      setPhotoPreview('')
      setPhotoError(err.message)
    } finally {
      setPreparing(false)
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validatePetForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const pet = await registerPet(toPetRequest(form))
      if (photo) {
        try {
          await uploadPetImage(pet.id, photo)
        } catch (err) {
          // 등록은 이미 성공했다 — 되돌리지 않고 상세로 보내 사진만 다시 시도하게 한다.
          // 입력한 정보를 사진 실패 때문에 잃는 것이 더 나쁘다
          navigate(`/pets/${pet.id}`, {
            replace: true,
            state: { photoError: `등록은 완료됐지만 사진 등록에 실패했습니다: ${err.message}` },
          })
          return
        }
      }
      navigate('/', { replace: true }) // 목록이 다시 마운트되며 새 데이터를 불러온다
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>반려동물 등록</h1>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {/* 사진은 선택 — 등록하지 않으면 목록·상세에 기본 이미지(🐶)가 표시된다 */}
        <div className="pet-photo">
          {photoPreview ? (
            <img src={photoPreview} alt="선택한 사진 미리보기" />
          ) : (
            <div className="pet-photo-placeholder" aria-hidden="true">🐶</div>
          )}
          <label className="pet-photo-upload">
            {preparing ? '불러오는 중…' : photo ? '사진 변경' : '사진 등록 (선택)'}
            <input
              type="file" accept={IMAGE_ACCEPT}
              onChange={onPhotoChange} disabled={preparing || submitting}
            />
          </label>
        </div>
        {photoError && <p className="field-error">{photoError}</p>}
        <label>
          이름 (필수)
          <input
            type="text" name="name" value={form.name} onChange={onChange}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </label>
        <label>
          품종 (선택)
          <input
            type="text" name="breed" value={form.breed} onChange={onChange}
            aria-invalid={Boolean(errors.breed)} placeholder="예: 푸들"
          />
          {errors.breed && <p className="field-error">{errors.breed}</p>}
        </label>
        <label>
          생년월일 (선택)
          <input
            type="date" name="birthDate" value={form.birthDate} onChange={onChange}
            aria-invalid={Boolean(errors.birthDate)} max={today()}
          />
          {errors.birthDate && <p className="field-error">{errors.birthDate}</p>}
        </label>
        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting || preparing}>
          {submitting ? '등록 중…' : '등록하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/">← 목록으로</Link>
      </p>
    </main>
  )
}
