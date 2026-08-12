import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { changePassword, getSessions, revokeSession } from './memberApi'
import { PASSWORD_RULE_LABEL, passwordRuleError } from './passwordRules'

// ISO 시각 → "2026. 8. 11. 오후 4:20" — 서버는 UTC(Z)로 주고 표시 변환은 프론트 몫 (백로그 10번 원칙)
function formatTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

// 마이페이지 — 보안 탭 (비밀번호 변경 + 로그인된 기기). 레이아웃·분리 배경은 MyPage.jsx 주석 참조.
// 세션 목록 API는 이 탭에 들어와야 호출된다 — 한 페이지 시절의 "진입 즉시 전부 로드"가 사라진 부수 효과
export default function MyPageSecurity() {
  const { user } = useAuth()

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' })
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
    } else {
      const ruleError = passwordRuleError(form.newPassword)
      if (ruleError) nextErrors.newPassword = ruleError
      // 같은 값 입력은 서버까지 안 가고 여기서 거른다 — 최종 판정은 서버(BCrypt 대조)가 한다
      else if (form.newPassword === form.currentPassword)
        nextErrors.newPassword = '새 비밀번호는 현재 비밀번호와 달라야 합니다.'
    }
    if (form.newPasswordConfirm !== form.newPassword)
      nextErrors.newPasswordConfirm = '비밀번호가 일치하지 않습니다.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      // 성공 — 다른 기기 세션은 서버가 끊었고, 이 기기는 새 쿠키로 로그인 유지
      setForm({ currentPassword: '', newPassword: '', newPasswordConfirm: '' })
      setSuccess(true)
    } catch (err) {
      // AUTH_INVALID_CREDENTIALS(현재 비밀번호 불일치)·AUTH_PASSWORD_UNCHANGED 등 — 서버 메시지를 그대로 안내
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // 로그인된 기기 목록 (api-spec.md 1절 5차). null = 아직 로딩 안 됨
  const [sessions, setSessions] = useState(null)
  const [sessionsError, setSessionsError] = useState('')
  const [revokingId, setRevokingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    getSessions()
      .then((list) => { if (!cancelled) setSessions(list) })
      .catch((err) => { if (!cancelled) setSessionsError(err.message) })
    return () => { cancelled = true }
  }, [])

  const onRevokeSession = async (sessionId) => {
    setSessionsError('')
    setRevokingId(sessionId)
    try {
      await revokeSession(sessionId)
      // 폐기 후 재조회 — 로컬에서 지우는 대신 서버 상태를 다시 읽어 화면과 어긋나지 않게 한다
      setSessions(await getSessions())
    } catch (err) {
      setSessionsError(err.message)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <>
      {/* 소셜 계정은 비밀번호 자체가 없어(password NULL) 폼을 보여줄 이유가 없다 —
          서버도 401로 거부하지만 폼을 숨기는 것이 1차 안내다 (api-spec.md 1절 4차) */}
      {user.provider !== 'LOCAL' && (
        <section>
          <h2>비밀번호 변경</h2>
          <p className="muted-note">카카오로 로그인한 계정은 비밀번호가 없습니다.</p>
        </section>
      )}
      {user.provider === 'LOCAL' && (
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
            새 비밀번호 ({PASSWORD_RULE_LABEL})
            <input
              type="password" name="newPassword" value={form.newPassword}
              onChange={onChange} aria-invalid={Boolean(errors.newPassword)}
              autoComplete="new-password"
            />
            {errors.newPassword && <p className="field-error">{errors.newPassword}</p>}
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password" name="newPasswordConfirm" value={form.newPasswordConfirm}
              onChange={onChange} aria-invalid={Boolean(errors.newPasswordConfirm)}
              autoComplete="new-password"
            />
            {errors.newPasswordConfirm && <p className="field-error">{errors.newPasswordConfirm}</p>}
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
      )}

      <section>
        <h2>로그인된 기기</h2>
        {sessions === null && !sessionsError && <p className="muted-note">불러오는 중…</p>}
        {sessionsError && <p className="submit-error">{sessionsError}</p>}
        {sessions && (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <div className="session-info">
                  <span className="session-device">
                    {s.deviceInfo ?? '알 수 없는 기기'}
                    {s.current && <span className="session-current">현재 기기</span>}
                  </span>
                  <span className="session-times">
                    로그인 {formatTime(s.loggedInAt)} · 마지막 사용 {formatTime(s.lastUsedAt)}
                  </span>
                </div>
                {/* 현재 기기에는 버튼을 두지 않는다 — 종료는 기존 로그아웃 버튼 몫이고, 서버도 400으로 거부한다 */}
                {!s.current && (
                  <button
                    type="button"
                    onClick={() => onRevokeSession(s.sessionId)}
                    disabled={revokingId !== null}
                  >
                    {revokingId === s.sessionId ? '로그아웃 중…' : '로그아웃'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
