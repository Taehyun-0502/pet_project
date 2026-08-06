import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerPet } from './petApi'
import '../member/member.css'
import './pet.css'

// 오늘 날짜(YYYY-MM-DD) — 생년월일 미래 입력 방지용
function today() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

// 서버(PetCreateRequest)와 같은 규칙으로 1차 검증 — 최종 차단은 서버가 한다
function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = '이름은 필수입니다.'
  else if (form.name.trim().length > 50) errors.name = '이름은 50자 이하여야 합니다.'
  if (form.breed.trim().length > 50) errors.breed = '품종은 50자 이하여야 합니다.'
  if (form.birthDate && form.birthDate > today()) errors.birthDate = '생년월일은 미래 날짜일 수 없습니다.'
  return errors
}

export default function PetCreatePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', breed: '', birthDate: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await registerPet({
        name: form.name.trim(),
        breed: form.breed.trim() || null,     // 빈 입력은 null로 — 서버 normalizeBreed와 같은 원칙
        birthDate: form.birthDate || null,
      })
      navigate('/', { replace: true })        // 목록이 다시 마운트되며 새 데이터를 불러온다
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
        <button type="submit" disabled={submitting}>
          {submitting ? '등록 중…' : '등록하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/">← 목록으로</Link>
      </p>
    </main>
  )
}
