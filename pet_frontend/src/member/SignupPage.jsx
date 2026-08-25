import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Field from '../common/Field'
import { IMAGE_ACCEPT, prepareImage } from '../common/imageUpload'
import Loading from '../common/Loading'
import { useForm } from '../common/useForm'
import { useAuth } from './AuthContext'
import { signup, uploadMyImage } from './memberApi'
import { PASSWORD_RULE_LABEL, passwordRuleError } from './passwordRules'
import '../common/modernist.css'
import './member.css'

// 서버(SignupRequest)와 같은 규칙으로 1차 검증 — 최종 차단은 서버가 한다
function validate(form) {
  const errors = {}
  if (!form.email.trim()) errors.email = '이메일은 필수입니다.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = '이메일 형식이 올바르지 않습니다.'
  else if (form.email.length > 255) errors.email = '이메일은 255자 이하여야 합니다.'

  if (!form.password) errors.password = '비밀번호는 필수입니다.'
  else {
    const ruleError = passwordRuleError(form.password)
    if (ruleError) errors.password = ruleError
  }

  if (form.passwordConfirm !== form.password)
    errors.passwordConfirm = '비밀번호가 일치하지 않습니다.'

  if (!form.name.trim()) errors.name = '이름은 필수입니다.'
  else if (form.name.trim().length > 50) errors.name = '이름은 50자 이하여야 합니다.'

  return errors
}

// 중복 오류는 필드 오류다 — 폼 하단이 아니라 해당 입력 아래에 붙여야 어디를 고칠지 보인다.
// 이름 중복은 서버가 어느 인덱스에 걸렸는지 가려내 따로 알려준다 (docs/api-spec.md 1절)
function mapError(err) {
  if (err.code === 'AUTH_EMAIL_DUPLICATED') return { email: err.message }
  if (err.code === 'AUTH_NAME_DUPLICATED') return { name: err.message }
  return null
}

export default function SignupPage() {
  const navigate = useNavigate()
  const { user, restoring, login, updateUser } = useAuth()

  /**
   * 프로필 사진(선택) — **펫 등록(PetCreatePage)과 같은 2단계 구조**다.
   * 업로드 API가 인증을 요구하는데(`POST /api/members/me/image`) 가입 시점에는 토큰이 없으므로,
   * 선택할 때는 검증·축소만 해두고 가입 → 자동 로그인 뒤에 이어서 올린다.
   * 서버·명세 변경은 없다 (docs/plan-2026-08-13.md F4).
   */
  const [photo, setPhoto] = useState(null) // 축소까지 끝난 업로드용 파일
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [preparing, setPreparing] = useState(false)

  // 미리보기 objectURL 해제 — 교체·이탈 때 정리하지 않으면 메모리에 남는다
  useEffect(() => {
    if (!photoPreview) return undefined
    return () => URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const onPhotoChange = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 같은 파일을 다시 골라도 change 이벤트가 나도록 초기화
    if (!file) return
    setPhotoError('')
    setPreparing(true)
    try {
      // 형식·용량 검증과 512px 축소 (common/imageUpload) — 펫 등록·마이페이지와 같은 규칙
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
  // 방금 이 화면에서 가입해 자동 로그인이 진행 중인지.
  // 이게 없으면 로그인으로 user가 채워지는 순간 아래 가드가 먼저 홈으로 보내버려
  // 온보딩 화면(/welcome)에 닿지 못한다
  const [signedUp, setSignedUp] = useState(false)

  const form = useForm({
    initialValues: { email: '', password: '', passwordConfirm: '', name: '' },
    validate,
    mapError,
    onSubmit: async (values) => {
      const email = values.email.trim()
      await signup({ email, password: values.password, name: values.name.trim() })

      // 가입 성공. 온보딩 화면에서 바로 반려동물을 등록하려면 토큰이 있어야 하는데
      // 가입 응답에는 토큰이 없으므로(명세) 방금 입력한 자격 증명으로 로그인을 이어서 호출한다.
      // 여기부터의 실패는 폼 오류가 아니므로 useForm의 catch에 맡기지 않고 직접 처리한다
      setSignedUp(true)
      try {
        await login({ email, password: values.password })
      } catch {
        // 가입 자체는 이미 성공했으니 되돌리지 않고 로그인 화면으로 안내한다.
        // 사진을 골랐더라도 여기서는 올릴 수 없다(토큰이 없다) — 로그인 후 마이페이지에서 등록하면 된다
        navigate('/login', { replace: true, state: { signupEmail: email } })
        return
      }

      // 로그인까지 됐으니 이제 사진을 올릴 수 있다. **실패해도 되돌리지 않는다**(펫 등록과 같은 정책) —
      // 사진 하나 때문에 방금 만든 계정과 입력한 정보를 잃는 것이 더 나쁘다. 안내만 온보딩으로 넘긴다
      let uploadError = ''
      if (photo) {
        try {
          updateUser(await uploadMyImage(photo)) // 전역 user 갱신 — 온보딩·홈에 바로 반영된다
        } catch (err) {
          uploadError = `가입은 완료됐지만 사진 등록에 실패했습니다: ${err.message}`
        }
      }
      navigate('/welcome', { replace: true, state: { fromSignup: true, photoError: uploadError } })
    },
  })

  // 복원이 끝나기 전에는 폼을 그리지 않는다 (백로그 64번 — LoginPage와 동일)
  if (restoring) return <Loading />
  // 이미 로그인한 상태면 가입 화면 대신 홈으로 (훅 호출 뒤에 둔다)
  if (user && !signedUp) return <Navigate to="/" replace />

  return (
    <main className="mn">
      <div className="mn-top">
        <div className="mn-brand">댕댕댕</div>
      </div>
      <div className="mn-rule" />
      <div className="auth-page">
      <h1>회원가입</h1>
      <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
        {/* 사진은 선택 — 등록하지 않으면 기본 이미지(👤)가 표시되고, 나중에 마이페이지에서 올릴 수 있다 */}
        <div className="profile-photo">
          {photoPreview ? (
            <img src={photoPreview} alt="선택한 사진 미리보기" />
          ) : (
            <div className="profile-photo-placeholder" aria-hidden="true">👤</div>
          )}
          <label className="profile-photo-upload">
            {preparing ? '불러오는 중…' : photo ? '사진 변경' : '프로필 사진 (선택)'}
            <input
              type="file" accept={IMAGE_ACCEPT}
              onChange={onPhotoChange} disabled={preparing || form.submitting}
            />
          </label>
        </div>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
        <Field form={form} name="email" label="이메일" type="email" autoComplete="email" />
        <Field
          form={form} name="password" label={`비밀번호 (${PASSWORD_RULE_LABEL})`}
          type="password" autoComplete="new-password"
        />
        <Field
          form={form} name="passwordConfirm" label="비밀번호 확인"
          type="password" autoComplete="new-password"
        />
        <Field form={form} name="name" label="이름" type="text" autoComplete="name" />
        {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
        <button type="submit" className="mn-primary block" disabled={form.submitting || preparing}>
          {form.submitting ? '가입 중…' : '가입하기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/login">이미 계정이 있으신가요? 로그인</Link>
      </p>
      </div>
    </main>
  )
}
