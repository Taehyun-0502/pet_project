// 삭제 확인 시트 — 내 영상의 오른쪽 위 휴지통 버튼으로 열린다.
// ReportSheet와 같은 자리·같은 스타일(rs-* 클래스 재사용)이고, 되돌릴 수 없는 동작이라
// 한 번 더 묻는 단계를 둔다.
//
// window.confirm을 쓰지 않은 이유: 영상이 재생되는 화면 위에 네이티브 대화상자가 뜨면
// 맥락이 끊기고, 무엇보다 confirm은 JS 스레드를 멈춰 재생·시청시간 집계가 함께 얼어붙는다.

import { useState } from 'react'
import { deleteShorts } from './shortsApi'

export default function DeleteSheet({ shortId, onClose, onDeleted }) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const onConfirm = async () => {
    setSubmitting(true)
    setError('')
    try {
      await deleteShorts(shortId)
      // 성공 문구를 띄우지 않고 바로 카드를 없앤다 — 지운 영상이 남아 있는 것이 더 이상하고,
      // 사라지는 것 자체가 결과 표시다
      onDeleted(shortId)
    } catch (err) {
      /*
       * 이미 지워진 영상이면 404가 온다. 사용자 입장에서는 목적이 달성된 것이라
       * 에러로 막지 않고 화면에서 치운다 (신고 시트가 409를 완료로 넘기는 것과 같은 판단).
       */
      if (err.code === 'SHORTS_NOT_FOUND') {
        onDeleted(shortId)
        return
      }
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    // 카드의 탭(재생/일시정지)이 시트 조작에 반응하지 않게 이벤트를 막는다
    <div className="rs-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="cs-head">
        <strong>영상 삭제</strong>
        <button type="button" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="rs-done">
        <p>이 영상을 삭제할까요?</p>
        <p className="rs-done-hint">
          되돌릴 수 없습니다. 영상에 달린 좋아요와 댓글도 함께 보이지 않게 됩니다.
        </p>

        {error && <p className="cs-error">{error}</p>}

        <button type="button" className="rs-submit rs-danger" onClick={onConfirm} disabled={submitting}>
          {submitting ? '삭제 중…' : '삭제'}
        </button>
        <button type="button" className="rs-cancel" onClick={onClose} disabled={submitting}>
          취소
        </button>
      </div>
    </div>
  )
}
