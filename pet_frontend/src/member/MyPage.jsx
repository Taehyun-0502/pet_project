import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resizeImage } from '../common/imageResize'
import { useAuth } from './AuthContext'
import { changePassword, updateMyName, uploadMyImage } from './memberApi'
import { PASSWORD_RULE_LABEL, passwordRuleError } from './passwordRules'
import './member.css'

// 마이페이지 — 내 정보(이름 수정) + 비밀번호 변경 (docs/roadmap.md 3번의 3-1·3-2 덩어리)
export default function MyPage() {
  const { user, updateUser } = useAuth()

  // 프로필 사진 — pet 상세와 같은 흐름 (검증 규칙도 서버 ImageStorageClient와 동일)
  const [photoError, setPhotoError] = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)

  const onPhotoChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setPhotoError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('jpeg·png·webp 이미지만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('이미지는 5MB 이하여야 합니다.')
      return
    }
    setPhotoUploading(true)
    try {
      // 업로드 전 512px 축소 — 원본이 아바타·썸네일 조회마다 내려가는 것을 막는다 (imageResize.js)
      const resized = await resizeImage(file)
      updateUser(await uploadMyImage(resized)) // 전역 user 갱신 — ?v= 덕에 즉시 새 이미지
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoUploading(false)
    }
  }

  // 이름 수정 — 성공 시 updateUser로 전역 상태를 맞춰 홈의 "OO님" 표시도 함께 갱신된다
  const [name, setName] = useState(user.name)
  const [nameError, setNameError] = useState('')
  const [nameNotice, setNameNotice] = useState('')
  const [nameSubmitting, setNameSubmitting] = useState(false)

  const onNameSubmit = async (e) => {
    e.preventDefault()
    setNameNotice('')
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('이름은 필수입니다.')
      return
    }
    if (trimmed.length > 50) {
      setNameError('이름은 50자 이하여야 합니다.')
      return
    }
    setNameError('')
    setNameSubmitting(true)
    try {
      const updated = await updateMyName({ name: trimmed })
      updateUser(updated)
      setName(updated.name)
      setNameNotice('이름이 변경되었습니다.')
    } catch (err) {
      setNameError(err.message)
    } finally {
      setNameSubmitting(false)
    }
  }

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

  return (
    <main className="auth-page">
      <h1>마이페이지</h1>

      <section className="my-info">
        <h2>내 정보</h2>
        <div className="profile-photo">
          {user.profileImageUrl ? (
            <img src={user.profileImageUrl} alt="내 프로필 사진" />
          ) : (
            <div className="profile-photo-placeholder" aria-hidden="true">👤</div>
          )}
          <label className="profile-photo-upload">
            {photoUploading ? '업로드 중…' : user.profileImageUrl ? '사진 변경' : '사진 등록'}
            <input
              type="file" accept="image/jpeg,image/png,image/webp"
              onChange={onPhotoChange} disabled={photoUploading}
            />
          </label>
        </div>
        {photoError && <p className="submit-error">{photoError}</p>}
        <dl>
          <div>
            <dt>이메일</dt>
            {/* 소셜 계정은 이메일 미동의 시 null (api-spec.md 1절 4차) */}
            <dd>{user.email ?? '미제공 (카카오 계정)'}</dd>
          </div>
        </dl>
        <form className="auth-form" onSubmit={onNameSubmit} noValidate>
          <label>
            이름
            <input
              type="text" name="name" value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(nameError)} autoComplete="name"
            />
            {nameError && <p className="field-error">{nameError}</p>}
          </label>
          {nameNotice && <p className="notice">{nameNotice}</p>}
          <button type="submit" disabled={nameSubmitting}>
            {nameSubmitting ? '저장 중…' : '이름 저장'}
          </button>
        </form>
      </section>

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

      <p className="auth-switch">
        <Link to="/">← 홈으로</Link>
      </p>
    </main>
  )
}
