import { useCallback, useRef, useState } from 'react'

/**
 * 폼 공용 훅 (리뷰 백로그 55번).
 *
 * 로그인·가입·펫 등록/수정·마이페이지 이름/비밀번호 — 여섯 개 폼이 "상태 4개 + onChange 스프레드 +
 * validate→setErrors→조기 반환 + try/catch/finally"를 거의 문자 단위로 복제하고 있었다.
 * 문제는 중복 자체가 아니라 **51·52·56번이 전부 그 여섯 곳을 똑같이 고쳐야 하는 수정**이었다는 점이다.
 * 그래서 세 가지를 여기 모았다.
 *
 * - **56번**: 입력을 고치면 그 필드 오류를 즉시 지운다 (예전에는 다음 제출까지 빨간 문구가 남았다)
 * - **51번**: 서버 검증 실패의 `details`(필드별 사유)를 해당 입력에 꽂는다
 *   (예전에는 `"password: 비밀번호가 너무 깁니다…"` 원문을 폼 하단에 통째로 찍었다)
 * - **52번**: 검증 실패 시 첫 오류 필드로 포커스를 옮긴다
 *
 * 폼 라이브러리를 쓰지 않은 이유는 6주 일정에 과설계이기 때문이다 — 필요한 것은 위 세 가지뿐이다.
 *
 * @param initialValues 초기값 객체. 키가 곧 input의 name이다
 * @param validate      (values) => { 필드명: 사유 } — 오류가 없으면 빈 객체
 * @param onSubmit      (values) => Promise. 던진 예외는 아래 규칙으로 화면에 배분된다
 * @param mapError      (err) => { 필드명: 사유 } | null — 코드 기반 매핑용(예: AUTH_EMAIL_DUPLICATED → email).
 *                      details가 없는 업무 오류를 특정 필드에 붙이고 싶을 때만 쓴다
 */
export function useForm({ initialValues, validate, onSubmit, mapError }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 첫 오류 필드로 포커스를 옮기기 위해 폼 DOM이 필요하다. 페이지가 <form ref={form.formRef}>로 연결한다
  const formRef = useRef(null)

  const focusField = (name) => {
    formRef.current?.querySelector(`[name="${name}"]`)?.focus()
  }

  // 오류를 세우면서 첫 필드로 포커스까지 옮긴다 (백로그 52번).
  // 화면 아래쪽 필드가 틀렸을 때 스크롤 없이 원인에 닿게 하려는 것이다
  const showErrors = (nextErrors) => {
    setErrors(nextErrors)
    const first = Object.keys(nextErrors)[0]
    if (first) focusField(first)
  }

  const change = (e) => {
    const { name, value } = e.target
    setValues((prev) => ({ ...prev, [name]: value }))
    // 백로그 56번 — 고친 필드의 오류는 즉시 지운다. 제출 오류도 함께 지운다:
    // "비밀번호가 틀렸습니다"가 남은 채로 다시 입력하는 화면은 무엇이 현재 상태인지 알 수 없다
    setErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
    setSubmitError('')
  }

  /**
   * 서버 오류를 화면에 배분한다.
   * ① `details`에 담긴 필드 중 **이 폼에 실제로 있는 것**만 입력 아래로 보낸다 —
   *    없는 필드에 붙이면 사용자에게 아무것도 보이지 않은 채 실패한다.
   * ② 폼에 없는 필드의 사유와 `mapError`가 처리하지 못한 나머지는 폼 하단(`submitError`)으로.
   */
  const applyError = (err) => {
    const mapped = mapError?.(err)
    if (mapped && Object.keys(mapped).length > 0) {
      showErrors(mapped)
      return
    }
    const details = err?.details
    if (details && typeof details === 'object') {
      const known = {}
      const unknown = []
      for (const [field, reason] of Object.entries(details)) {
        if (field in values) known[field] = reason
        else unknown.push(reason)
      }
      if (Object.keys(known).length > 0) {
        showErrors(known)
        if (unknown.length > 0) setSubmitError(unknown.join(' '))
        return
      }
      if (unknown.length > 0) {
        setSubmitError(unknown.join(' '))
        return
      }
    }
    setSubmitError(err?.message ?? '요청을 처리하지 못했습니다.')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate ? validate(values) : {}
    if (Object.keys(nextErrors).length > 0) {
      showErrors(nextErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      applyError(err)
    } finally {
      // 성공 후 화면을 떠나는 폼에서는 언마운트 뒤 호출이지만 React 18+에서 no-op이다
      setSubmitting(false)
    }
  }

  // 비동기로 불러온 값으로 폼을 채울 때 (펫 수정). 이전 오류도 함께 초기화한다.
  // **useCallback이 필수다** — 펫 수정 화면이 이걸 useEffect 의존성에 넣는데,
  // 렌더마다 새 함수면 effect가 매번 다시 돌아 조회가 무한 반복된다 (setState 3개는 이미 안정적)
  const reset = useCallback((nextValues) => {
    setValues(nextValues)
    setErrors({})
    setSubmitError('')
  }, [])

  return {
    values, errors, submitError, submitting,
    change, handleSubmit, reset, formRef,
    setValues, setSubmitError,
  }
}
