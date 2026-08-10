import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { changePassword } from './memberApi'
import './member.css'

// 마이페이지 — 내 정보 표시 + 비밀번호 변경 (3-1 덩어리, docs/roadmap.md 3번)
// 이름 수정은 3-2에서 이 화면에 얹는다
export default function MyPage() {
  const { user } = useAuth()

  const [form, setForm] = useState({ currentPassword: '', newPassword: '' })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSuccess(false)
    const nextErrors = {}
    if (!form.currentPassword) nextErrors.currentPassword = '현재 비밀번호는 필수입니다.'
    if (!form.newPassword) {
      nextErrors.newPassword = '새 비밀번호는 필수입니다.'
    } else if (form.newPassword.length < 8 || form.newPassword.length > 60) {
      nextErrors.newPassword = '비밀번호는 8자 이상 60자 이하여야 합니다.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await changePassword(form)
      // 성공 — 다른 기기 세션은 서버가 끊었고, 이 기기는 새 쿠키로 로그인 유지
      setForm({ currentPassword: '', newPassword: '' })
      setSuccess(true)
    } catch (err) {
      // AUTH_INVALID_CREDENTIALS(현재 비밀번호 불일치)·VALIDATION_ERROR 등 — 서버 메시지를 그대로 안내
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <h1>마이페이지</h1>

      <section className="my-info">
        <h2>내 정보</h2>
        <dl>
          <div>
            <dt>이름</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>이메일</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>비밀번호 변경</h2>
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <label>
            현재 비밀번호
            <input
              type="password" name="currentPassword" value={form.currentPassword}
              onChange={onChange} aria-invalid={Boolean(errors.currentPassword)}
              autoComplete="current-password"
            />
            {errors.currentPassword && <p className="field-error">{errors.currentPassword}</p>}
          </label>
          <label>
            새 비밀번호
            <input
              type="password" name="newPassword" value={form.newPassword}
              onChange={onChange} aria-invalid={Boolean(errors.newPassword)}
              autoComplete="new-password"
            />
            {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
          </label>
          {submitError && <p className="submit-error">{submitError}</p>}
          {success && (
            <p className="notice">비밀번호가 변경되었습니다. 다른 기기에서는 로그아웃됩니다.</p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      </section>

      <p className="auth-switch">
        <Link to="/">← 홈으로</Link>
      </p>
    </main>
  )
}
