// 신고 시트 — 카드 오른쪽 위 햄버거로 열린다. CommentSheet와 같은 자리(카드 하단)에 올라오고
// 9:16 프레임을 넘지 않는다.
//
// ⚠️ 지금은 **화면만** 있다. 접수 버튼을 눌러도 서버로 보내지 않고 완료 문구만 띄운다 —
// 신고를 저장할 API·테이블이 아직 없다 (shorts_guide_1.md 8-9절).
//
// 그래서 완료 문구를 "접수되었습니다"가 아니라 "신고가 완료되었습니다"로 두되, 저장하는 것처럼
// 읽히는 표현(접수 번호·처리 현황 안내 등)은 넣지 않았다. 백엔드가 붙으면 handleSubmit의
// setDone(true) 자리에 reportShorts() 호출만 넣으면 되도록 상태 흐름은 그대로 만들어 뒀다.

import { useState } from 'react'

const MAX_DETAIL = 500

/*
 * 사유 목록. 백엔드가 붙을 때 value가 그대로 서버로 가는 계약값이 된다.
 *
 * 두 개뿐인 이유: 분류가 늘면 신고자가 고민하다 이탈하고, 운영자도 경계가 모호한 칸에서
 * 같은 판단을 반복한다. 세분화가 필요해지면 접수량을 보고 쪼갠다.
 */
const REASONS = [
  {
    value: 'inappropriate',
    label: '부적절한 콘텐츠',
    hint: '폭력·혐오·성적인 내용이거나 동물 학대가 담긴 영상',
  },
  {
    value: 'copyright',
    label: '저작권 침해',
    hint: '음원·영상을 권리자 허락 없이 사용한 영상',
  },
]

export default function ReportSheet({ onClose }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  /*
   * 서버 호출이 없으므로 실패 경로도 없다 — submitting 상태나 에러 처리를 두지 않았다.
   * 사유 미선택만 여기서 막는다(버튼이 이미 disabled지만, 폼 제출은 엔터로도 일어난다).
   */
  const onSubmit = (e) => {
    e.preventDefault()
    if (!reason) {
      setError('신고 사유를 골라주세요.')
      return
    }
    setDone(true)
  }

  return (
    // 카드의 탭(재생/일시정지)이 시트 조작에 반응하지 않게 이벤트를 막는다 (CommentSheet와 동일)
    <div className="rs-sheet" onClick={(e) => e.stopPropagation()}>
      <div className="cs-head">
        <strong>{done ? '신고 완료' : '신고하기'}</strong>
        <button type="button" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      {done ? (
        <div className="rs-done">
          <p>신고가 완료되었습니다.</p>
          <p className="rs-done-hint">
            검토 후 조치되며, 그동안 영상이 그대로 보일 수 있습니다.
          </p>
          <button type="button" className="rs-submit" onClick={onClose}>
            닫기
          </button>
        </div>
      ) : (
        <form className="rs-form" onSubmit={onSubmit}>
          {/* label로 감싸지 않고 fieldset/legend로 묶는다 — 선택 대상이 둘이라 label 하나가
              가리킬 곳이 없다 (업로드 화면의 주제 칩과 같은 이유) */}
          <fieldset className="rs-reasons">
            <legend>어떤 문제가 있나요?</legend>
            {REASONS.map((item) => (
              <label
                key={item.value}
                className={reason === item.value ? 'rs-reason rs-reason-on' : 'rs-reason'}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={item.value}
                  checked={reason === item.value}
                  onChange={() => {
                    setReason(item.value)
                    setError('')
                  }}
                />
                <span className="rs-reason-body">
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="rs-detail">
            상세 내용 (선택)
            <textarea
              value={detail}
              maxLength={MAX_DETAIL}
              rows={3}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="어떤 부분이 문제인지 적어주시면 검토가 빨라집니다."
            />
          </label>

          {error && <p className="cs-error">{error}</p>}

          <button type="submit" className="rs-submit" disabled={!reason}>
            신고 접수
          </button>
        </form>
      )}
    </div>
  )
}
