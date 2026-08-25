import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Field from '../common/Field'
import { useForm } from '../common/useForm'
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
  const location = useLocation()
  const [loaded, setLoaded] = useState(false) // 기존 값을 폼에 채웠는지
  const [loadError, setLoadError] = useState(null)

  /**
   * 저장·이탈 후 돌아갈 곳. 기본은 상세지만, 마이페이지 펫 정보 탭처럼 상세를 거치지 않고
   * 들어온 화면은 `state.from`으로 자기 경로를 넘긴다 — 없으면 저장 후 상세에 남아
   * 원래 있던 관리 화면으로 돌아갈 길이 끊긴다 (docs/plan-2026-08-13.md F5).
   * 사용자가 지어낸 값이 들어올 수 있는 자리가 아니다(같은 앱의 코드가 넘기는 값).
   */
  const backTo = location.state?.from ?? `/pets/${petId}`

  const form = useForm({
    initialValues: { name: '', breed: '', birthDate: '' },
    validate: validatePetForm,
    onSubmit: async (values) => {
      await updatePet(petId, toPetRequest(values))
      navigate(backTo, { replace: true }) // 돌아간 화면이 다시 마운트되며 갱신된 값을 불러온다
    },
  })
  const { reset } = form

  useEffect(() => {
    let cancelled = false
    getPet(petId)
      .then((pet) => {
        if (cancelled) return
        // null인 선택 항목은 빈 문자열로 — input의 value가 null이면 비제어 컴포넌트로 바뀐다
        reset({ name: pet.name, breed: pet.breed ?? '', birthDate: pet.birthDate ?? '' })
        setLoaded(true)
      })
      .catch((err) => { if (!cancelled) setLoadError(err) })
    return () => { cancelled = true }
  }, [petId, reset])

  if (loadError) {
    return (
      <main className="auth-page">
        <h1>반려동물 수정</h1>
        <p className="submit-error" role="alert">
          {loadError.code === 'PET_NOT_FOUND'
            ? '찾을 수 없는 반려동물입니다. 삭제되었거나 접근 권한이 없습니다.'
            : loadError.message}
        </p>
        <p className="auth-switch"><Link to="/">← 목록으로</Link></p>
      </main>
    )
  }

  if (!loaded) {
    return (
      <main className="auth-page">
        <p>불러오는 중…</p>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <h1>반려동물 수정</h1>
      <form className="auth-form" ref={form.formRef} onSubmit={form.handleSubmit} noValidate>
        <Field form={form} name="name" label="이름 (필수)" type="text" />
        <Field form={form} name="breed" label="품종 (선택)" type="text" placeholder="예: 푸들" />
        <Field form={form} name="birthDate" label="생년월일 (선택)" type="date" max={today()} />
        <p className="muted-note">비워 두면 그 항목은 지워집니다.</p>
        {form.submitError && <p className="submit-error" role="alert">{form.submitError}</p>}
        <button type="submit" disabled={form.submitting}>
          {form.submitting ? '저장 중…' : '저장하기'}
        </button>
      </form>
      <p className="auth-switch">
        {/* 저장하지 않고 나갈 때도 들어온 곳으로 — 문구는 목적지에 맞춰 바꾼다 */}
        <Link to={backTo}>{location.state?.from ? '← 돌아가기' : '← 상세로'}</Link>
      </p>
    </main>
  )
}
