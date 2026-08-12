import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getPet, updatePet } from './petApi'
import { today, toPetRequest, validatePetForm } from './petForm'
import '../common/forms.css'
import './pet.css'

/**
 * 반려동물 수정 (docs/api-spec.md 2절).
 * PUT은 **전체 교체**라 서버로 보내는 바디에 세 필드가 모두 들어가야 한다 —
 * 그래서 기존 값을 먼저 불러와 폼을 채운 뒤 제출한다. 빈 칸으로 두면 그 값이 지워진다.
 */
export default function PetEditPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)     // null = 기존 값 불러오는 중
  const [loadError, setLoadError] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPet(petId)
      .then((pet) => {
        if (cancelled) return
        // null인 선택 항목은 빈 문자열로 — input의 value가 null이면 비제어 컴포넌트로 바뀐다
        setForm({ name: pet.name, breed: pet.breed ?? '', birthDate: pet.birthDate ?? '' })
      })
      .catch((err) => { if (!cancelled) setLoadError(err) })
    return () => { cancelled = true }
  }, [petId])

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validatePetForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await updatePet(petId, toPetRequest(form))
      navigate(`/pets/${petId}`, { replace: true }) // 상세가 다시 마운트되며 갱신된 값을 불러온다
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <main className="auth-page">
        <h1>반려동물 수정</h1>
        <p className="submit-error">
          {loadError.code === 'PET_NOT_FOUND'
            ? '찾을 수 없는 반려동물입니다. 삭제되었거나 접근 권한이 없습니다.'
            : loadError.message}
        </p>
        <p className="auth-switch"><Link to="/">← 목록으로</Link></p>
      </main>
    )
  }

  if (!form) {
    return (
      <main className="auth-page">
        <p>불러오는 중…</p>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <h1>반려동물 수정</h1>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
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
        <p className="muted-note">비워 두면 그 항목은 지워집니다.</p>
        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '저장 중…' : '저장하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to={`/pets/${petId}`}>← 상세로</Link>
      </p>
    </main>
  )
}
