/*
 * T 텍스트 시트. (가이드 5-2절)
 *
 * 글자를 적어 추가하면 미리보기 가운데에 나타나고, **미리보기에서 직접 끌어** 옮긴다.
 * 지우기도 거기서 한다 — 아래 가운데 쓰레기통으로 끌면 된다(OverlayTextLayer).
 *
 * 시트에 글자 목록을 두지 않는다. 글자가 늘 때마다 줄이 늘어 시트가 길어지고, 무엇보다
 * "화면의 저 글자"와 "목록의 이 줄"을 눈으로 다시 이어야 한다. 그 연결을 없앤 자리에
 * **색 고르기**를 넣었다 — 목록보다 이쪽이 자주 쓰인다.
 *
 * 좌표는 0~100(%)이고 **글자 블록의 중심**이다. 픽셀이 아닌 이유는 보는 기기마다 프레임
 * 크기가 달라서다(서버 ShortsOverlayText 주석과 같은 규칙 — 한쪽만 바꾸면 위치가 어긋난다).
 */

import { useEffect, useState } from 'react'
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_SIZE,
  MAX_OVERLAY_TEXT,
  MAX_OVERLAY_TEXTS,
  TEXT_COLORS,
} from './overlayText'

export default function TextSheet({ draft, patchDraft, selectedId, onSelect, onClose }) {
  const [input, setInput] = useState('')
  /*
   * 지금 고른 색. 두 가지로 쓰인다 — 새로 추가할 글자의 색이고, 고른 글자가 있으면 그 글자의 색을
   * 바로 바꾼다. 나눠 두면 "색을 골랐는데 아무 일도 안 일어나는" 순간이 생긴다.
   */
  const [color, setColor] = useState(DEFAULT_TEXT_COLOR)
  /*
   * 새 글자의 기본 크기. 시트에는 조절기를 두지 않는다 — 크기·기울기는 미리보기에서 직접
   * (두 손가락 또는 손잡이로) 만진다. 이 값은 "새로 추가할 때 1배로 시작한다"는 뜻일 뿐이다.
   */
  const size = DEFAULT_TEXT_SIZE

  const texts = draft.textOverlays
  const full = texts.length >= MAX_OVERLAY_TEXTS
  const selected = texts.find((t) => t.id === selectedId)

  /*
   * 고른 글자가 바뀌면 색 팔레트를 **그 글자의 색**에 맞춘다. 안 그러면 다른 글자를 골랐는데
   * 팔레트는 이전 글자의 색을 켜둔 채라, 무엇이 적용된 상태인지 읽을 수 없다.
   *
   * selectedId만 본다 — 색을 바꿀 때마다 draft가 바뀌므로 목록까지 넣으면 되먹임이 생긴다.
   */
  useEffect(() => {
    const item = draft.textOverlays.find((t) => t.id === selectedId)
    if (item) setColor(item.color ?? DEFAULT_TEXT_COLOR)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const add = () => {
    const text = input.trim()
    if (!text || full) return
    /*
     * id는 화면에서만 쓰는 값이다(리스트 key, 지금 고른 글자 표시). 서버로는 보내지 않는다 —
     * 저장 모양은 { text, top, left, color, size }뿐이다.
     */
    const item = { id: `t${Date.now()}${texts.length}`, text, top: 50, left: 50, color, size }
    patchDraft({ textOverlays: [...texts, item] })
    onSelect(item.id)
    setInput('')
  }

  // 고른 글자가 있으면 즉시 반영. 없으면 다음에 추가할 글자에 쓰인다
  const applyToSelected = (partial) => {
    if (!selectedId) return
    patchDraft({
      textOverlays: texts.map((t) => (t.id === selectedId ? { ...t, ...partial } : t)),
    })
  }

  const pickColor = (next) => {
    setColor(next)
    applyToSelected({ color: next })
  }

  return (
    <div className="sc-sheet">
      <div className="sc-sheet-bar">
        <strong>텍스트</strong>
        <button type="button" className="sc-sheet-close" onClick={onClose}>
          완료
        </button>
      </div>

      <div className="sc-sheet-body">
        <div className="sc-text-add">
          <input
            type="text"
            className="sc-search"
            value={input}
            maxLength={MAX_OVERLAY_TEXT}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder={full ? `글자는 ${MAX_OVERLAY_TEXTS}개까지입니다` : '예: 오늘 처음 산책!'}
            disabled={full}
            aria-label="넣을 글자"
          />
          <button type="button" className="sc-next" onClick={add} disabled={!input.trim() || full}>
            추가
          </button>
        </div>

        <div className="sc-colors" role="group" aria-label="글자 색">
          {TEXT_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === color ? 'sc-color sc-color-on' : 'sc-color'}
              style={{ background: value }}
              onClick={() => pickColor(value)}
              aria-label={`글자 색 ${value}`}
              aria-pressed={value === color}
            />
          ))}
        </div>


        <p className="sc-note">
          {texts.length === 0 ? (
            <>글자를 추가하면 미리보기 가운데에 나타납니다.</>
          ) : selected ? (
            <>
              고른 글자 <strong>“{selected.text}”</strong>의 색이 바뀝니다. 미리보기에서 글자를{' '}
              <strong>두 손가락으로 벌리면 커지고 비틀면 기울어집니다</strong> — 마우스라면 글자
              오른쪽 아래 <strong>손잡이</strong>를 끄세요. 아래 쓰레기통으로 끌면 삭제됩니다.
            </>
          ) : (
            <>
              미리보기에서 글자를 <strong>끌어서 옮기고</strong>, 아래{' '}
              <strong>쓰레기통으로 끌면 삭제</strong>됩니다. 글자를 한 번 누르면 색을 바꾸거나
              크기·기울기 손잡이를 쓸 수 있습니다.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
