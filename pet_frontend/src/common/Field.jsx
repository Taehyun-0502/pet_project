/**
 * 폼 입력 한 칸 (리뷰 백로그 52·55번).
 *
 * 예전 마크업은 `<label>라벨 <input/> <p class="field-error">…</p></label>` 구조였다.
 * 오류 `<p>`가 label **안**에 있으면 그 텍스트까지 입력의 접근 이름에 합쳐져,
 * 스크린리더가 필드를 `"이메일 이메일은 필수입니다."`라고 읽는다.
 * 그래서 label을 `htmlFor`로 분리하고 오류는 `aria-describedby`로 **설명**으로 연결한다 —
 * 이름은 "이메일", 설명은 "이메일은 필수입니다."로 역할이 갈린다.
 *
 * `children`을 주면 input 대신 그것을 렌더한다 (select 등 다른 컨트롤용).
 */
export default function Field({ form, name, label, children, ...inputProps }) {
  const error = form.errors[name]
  const id = `field-${name}`
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children ?? (
        <input
          id={id}
          name={name}
          value={form.values[name] ?? ''}
          onChange={form.change}
          // 값이 false여도 속성이 붙는 것을 피한다 — aria-invalid="false"는 불필요한 소음이다
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
      )}
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  )
}
