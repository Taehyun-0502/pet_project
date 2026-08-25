import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Field from '../common/Field'
import { useForm } from '../common/useForm'
import { useAuth } from './AuthContext'
import { changePassword, getSessions, revokeSession } from './memberApi'
import MyPageWithdraw from './MyPageWithdraw'
import { PASSWORD_RULE_LABEL, passwordRuleError } from './passwordRules'

// 서버(PasswordChangeRequest)와 같은 규칙 — 가입 폼과 passwordRules 모듈을 공유한다
function validate(values) {
  const errors = {}
  if (!values.currentPassword) errors.currentPassword = '현재 비밀번호는 필수입니다.'
  if (!values.newPassword) {
    errors.newPassword = '새 비밀번호는 필수입니다.'
  } else {
    const ruleError = passwordRuleError(values.newPassword)
    if (ruleError) errors.newPassword = ruleError
    // 같은 값 입력은 서버까지 안 가고 여기서 거른다 — 최종 판정은 서버(BCrypt 대조)가 한다
    else if (values.newPassword === values.currentPassword)
      errors.newPassword = '새 비밀번호는 현재 비밀번호와 달라야 합니다.'
  }
  if (values.newPasswordConfirm !== values.newPassword)
    errors.newPasswordConfirm = '비밀번호가 일치하지 않습니다.'
  return errors
}

const EMPTY_PASSWORD_FORM = { currentPassword: '', newPassword: '', newPasswordConfirm: '' }

// ISO 시각 → "2026. 8. 11. 오후 4:20" — 서버는 UTC(Z)로 주고 표시 변환은 프론트 몫 (백로그 10번 원칙)
function formatTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * 마이페이지 — 보안 화면 (비밀번호 변경 + 로그인된 기기 + 회원 탈퇴).
 *
 * 탭이 아니라 "내 정보"에서 버튼으로 들어오는 하위 화면이라 **복귀 링크가 필수**다
 * (MyPage.jsx 주석 참조). 세션 목록 API는 이 화면에 들어와야 호출된다 —
 * 한 페이지 시절의 "진입 즉시 전부 로드"가 사라진 부수 효과.
 *
 * 회원 탈퇴는 2026-08-13 개편으로 독립 탭에서 이 화면 하단으로 들어왔다.
 * 컴포넌트(MyPageWithdraw)를 그대로 렌더해 검증까지 끝난 탈퇴 로직은 손대지 않는다.
 */
export default function MyPageSecurity() {
  const { user } = useAuth()

  const [success, setSuccess] = useState(false)

  const form = useForm({
    initialValues: EMPTY_PASSWORD_FORM,
    validate,
    // 현재 비밀번호 불일치는 그 입력의 문제다 — 폼 하단이 아니라 해당 칸에 붙인다.
    // 서버가 이 경우 details를 주지 않으므로(업무 오류라 검증 실패가 아니다) 코드로 매핑한다.
    // 문구는 서버 메시지를 그대로 쓰지 않는다 — AUTH_INVALID_CREDENTIALS는 로그인과 공용이라
    // "이메일 또는 비밀번호가…"인데, 이메일을 입력하지도 않는 이 화면에서는 혼란만 준다
    mapError: (err) => (
      err.code === 'AUTH_INVALID_CREDENTIALS'
        ? { currentPassword: '현재 비밀번호가 올바르지 않습니다.' }
        : null
    ),
    onSubmit: async (values) => {
      setSuccess(false)
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      // 성공 — 다른 기기 세션은 서버가 끊었고, 이 기기는 새 쿠키로 로그인 유지
      form.reset(EMPTY_PASSWORD_FORM)
      setSuccess(true)
    },
  })

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
      <p className="mypage-back">
        <Link to="/mypage">← 내 정보</Link>
      </p>
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
        <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
          <Field
            form={form} name="currentPassword" label="현재 비밀번호"
            type="password" autoComplete="current-password"
          />
          <Field
            form={form} name="newPassword" label={`새 비밀번호 (${PASSWORD_RULE_LABEL})`}
            type="password" autoComplete="new-password"
          />
          <Field
            form={form} name="newPasswordConfirm" label="새 비밀번호 확인"
            type="password" autoComplete="new-password"
          />
          {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
          {success && (
            <p className="notice" role="status">
              비밀번호가 변경되었습니다. 다른 기기에서는 로그아웃됩니다.
            </p>
          )}
          <button type="submit" className="mn-primary block" disabled={form.submitting}>
            {form.submitting ? '변경 중…' : '비밀번호 변경'}
          </button>
        </form>
      </section>
      )}

      <section>
        <h2>로그인된 기기</h2>
        {sessions === null && !sessionsError && <p className="muted-note">불러오는 중…</p>}
        {sessionsError && <p className="submit-error" role="alert">{sessionsError}</p>}
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

      {/* 위험 영역 — 화면 맨 아래에 둔다. 비밀번호·기기를 보러 온 사람이 탈퇴 버튼을 먼저 만나지 않게 */}
      <MyPageWithdraw />
    </>
  )
}
