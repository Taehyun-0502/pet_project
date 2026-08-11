// 비밀번호 규칙 검증 — 가입 폼과 마이페이지 변경 폼이 공유한다.
// 서버(SignupRequest·PasswordChangeRequest)와 같은 규칙: 8~60자 + UTF-8 72바이트 이하.
// 두 폼에 각자 두면 규칙이 조용히 갈라진다 (pet 도메인이 petForm.js로 묶은 것과 같은 이유).

// 라벨에 함께 쓰는 안내 문구 — 한글은 글자당 3바이트라 24자가 실질 상한이다
export const PASSWORD_RULE_LABEL = '8자 이상, 한글은 24자까지'

// 빈 값 검사는 폼마다 문구가 달라("비밀번호는"/"새 비밀번호는") 각 폼에 둔다.
// 값이 있을 때의 규칙 위반만 검사하고, 통과하면 빈 문자열을 돌려준다.
export function passwordRuleError(password) {
  if (password.length < 8 || password.length > 60) {
    return '비밀번호는 8자 이상 60자 이하여야 합니다.'
  }
  // BCrypt는 72바이트까지만 처리한다 — 서버 @MaxBytes(72)와 같은 검사 (백로그 50번)
  if (new TextEncoder().encode(password).length > 72) {
    return '비밀번호가 너무 깁니다. (UTF-8 기준 72바이트 이하, 한글은 24자까지)'
  }
  return ''
}
