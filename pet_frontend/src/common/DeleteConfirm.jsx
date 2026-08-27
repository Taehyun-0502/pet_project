import { useEffect, useRef } from 'react'

/**
 * 삭제 2단 확인 — window.confirm 대체 (2026-08-27).
 *
 * confirm을 쓰지 않는 이유: 대화상자를 억제하는 환경(설치형 PWA 일부, 인앱 브라우저,
 * 자동화 브라우저)에서는 confirm이 뜨지도 않고 즉시 false를 반환해, 삭제 버튼이
 * 아무 반응 없는 것처럼 보인다(실측 — 펫 삭제 무반응의 원인이었다). 화면 안 UI는
 * 어디서나 같게 동작하고 웜톤 디자인과도 맞는다.
 *
 * 쓰는 쪽 계약: 트리거 버튼을 이 컴포넌트로 갈아 끼우고, onConfirm에서 실제 삭제,
 * onCancel에서 원래 버튼으로 되돌린다. 스타일은 warm.css .confirm-inline —
 * 위치·배경이 다른 곳(숏츠 타일 오버레이 등)은 className으로 덧입힌다.
 */
export default function DeleteConfirm({ message, busy, onConfirm, onCancel, className }) {
  // 트리거 버튼이 사라지며 포커스가 body로 떨어지므로 여기로 옮긴다.
  // 확인이 아니라 취소에 주는 이유: Enter 연타가 그대로 삭제로 이어지지 않게
  const cancelRef = useRef(null)
  useEffect(() => { cancelRef.current?.focus() }, [])

  return (
    <span
      className={className ? `confirm-inline ${className}` : 'confirm-inline'}
      role="group"
      aria-label={message}
    >
      <span className="confirm-inline-msg">{message}</span>
      <button type="button" className="confirm-inline-yes" onClick={onConfirm} disabled={busy}>
        {busy ? '삭제 중…' : '삭제'}
      </button>
      <button ref={cancelRef} type="button" className="confirm-inline-no" onClick={onCancel} disabled={busy}>
        취소
      </button>
    </span>
  )
}
