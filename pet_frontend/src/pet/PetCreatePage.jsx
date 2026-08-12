import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerPet } from './petApi'
import { today, toPetRequest, validatePetForm } from './petForm'
import '../common/forms.css'
import './pet.css'

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
    const nextErrors = validatePetForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await registerPet(toPetRequest(form))
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
