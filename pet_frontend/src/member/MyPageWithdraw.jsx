import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../common/apiClient'
import { useAuth } from './AuthContext'
import { withdraw } from './memberApi'

// 소셜 계정의 탈퇴 확인 문구 — 서버(MemberService.WITHDRAW_CONFIRM_PHRASE)와 계약 (api-spec.md 1절 6차)
const WITHDRAW_CONFIRM_PHRASE = '탈퇴합니다'

// 마이페이지 — 회원 탈퇴 탭 (위험 영역이라 별도 탭으로 격리). 레이아웃·분리 배경은 MyPage.jsx 주석 참조
export default function MyPageWithdraw() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const isLocal = user.provider === 'LOCAL'

  // 접혀 있다가 "회원 탈퇴"를 눌러야 확인 폼이 열린다 (실수 클릭 방지 1차)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawConfirm, setWithdrawConfirm] = useState('')
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  const onWithdraw = async (e) => {
    e.preventDefault()
    setWithdrawError('')
    if (!withdrawConfirm) {
      setWithdrawError(isLocal ? '현재 비밀번호를 입력해 주세요.' : '확인 문구를 입력해 주세요.')
      return
    }
    // 문구는 프론트에서 1차 차단 — 최종 판정은 서버 (비밀번호는 서버 BCrypt 대조만)
    if (!isLocal && withdrawConfirm !== WITHDRAW_CONFIRM_PHRASE) {
      setWithdrawError(`확인 문구가 일치하지 않습니다. "${WITHDRAW_CONFIRM_PHRASE}"를 입력해 주세요.`)
      return
    }
    setWithdrawing(true)
    try {
      await withdraw(isLocal ? { password: withdrawConfirm } : { confirmPhrase: withdrawConfirm })
      // 서버가 전 기기 토큰 폐기 + 쿠키 삭제까지 끝냈다 — 여기는 로컬 상태만 정리
      clearToken()
      updateUser(null)
      window.alert('탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.')
      navigate('/login', { replace: true })
    } catch (err) {
      // 비밀번호 불일치(401)·문구 불일치(400)·방장 방 보유(409 WITHDRAW_CHAT_OWNER) — 서버 메시지 그대로
      setWithdrawError(err.message)
      setWithdrawing(false)
    }
  }

  return (
    <section className="danger-zone">
      <h2>회원 탈퇴</h2>
      {!withdrawOpen ? (
        <>
          <p className="muted-note">탈퇴하면 모든 기기에서 로그아웃되며, 계정을 복구할 수 없습니다.</p>
          <button type="button" className="danger-link" onClick={() => setWithdrawOpen(true)}>
            회원 탈퇴
          </button>
        </>
      ) : (
        <form className="auth-form" onSubmit={onWithdraw} noValidate>
          <p className="muted-note">
            {isLocal
              ? '본인 확인을 위해 현재 비밀번호를 입력해 주세요.'
              : `확인을 위해 "${WITHDRAW_CONFIRM_PHRASE}"를 입력해 주세요.`}
            {' '}방장인 채팅방이 있으면 위임하거나 방을 삭제한 뒤 탈퇴할 수 있습니다.
          </p>
          <label>
            {isLocal ? '현재 비밀번호' : '확인 문구'}
            <input
              type={isLocal ? 'password' : 'text'}
              value={withdrawConfirm}
              onChange={(e) => setWithdrawConfirm(e.target.value)}
              aria-invalid={Boolean(withdrawError)}
              autoComplete={isLocal ? 'current-password' : 'off'}
            />
          </label>
          {withdrawError && <p className="submit-error">{withdrawError}</p>}
          <button type="submit" className="danger" disabled={withdrawing}>
            {withdrawing ? '탈퇴 처리 중…' : '탈퇴하기'}
          </button>
          <button
            type="button"
            disabled={withdrawing}
            onClick={() => { setWithdrawOpen(false); setWithdrawConfirm(''); setWithdrawError('') }}
          >
            취소
          </button>
        </form>
      )}
    </section>
  )
}
