/*
 * 미리보기 위에 얹힌 글자들 — **화면에서 직접** 옮기고, 키우고, 기울이고, 버린다.
 *
 *   옮기기   글자를 잡고 끈다
 *   키우기·기울이기
 *            폰: 두 손가락으로 벌리고 비튼다
 *            PC: 고른 글자의 오른쪽 아래 손잡이를 끈다 — 중심에서 멀어지면 커지고, 돌리면 기울어진다
 *   버리기   아래 가운데 쓰레기통으로 끈다
 *
 * 시트에 슬라이더를 두지 않는 이유: 크기와 기울기는 "얼마인지"가 아니라 "어떻게 보이는지"로
 * 정하는 값이다. 화면 아래 슬라이더를 보며 위쪽 글자를 맞추면 시선이 계속 왔다 갔다 한다.
 *
 * 포인터를 **층 전체**에서 받는다(글자 요소 각각이 아니라). 두 번째 손가락이 글자 바깥에
 * 닿아도 확대가 되어야 하는데, 글자마다 받으면 작은 글자 위에 손가락 두 개를 정확히 올려야 한다.
 *
 * ③ 편집기와 ④ 커버 정하기가 이 컴포넌트 하나를 함께 쓴다 — 같은 동작이 두 화면에서 다르면
 * 어느 쪽 규칙인지 매번 기억해야 한다.
 *
 * **부모는 position:relative + overflow:hidden인 9:16 프레임이어야 한다.**
 */

import { useRef, useState } from 'react'
import { MAX_TEXT_SIZE, MIN_TEXT_SIZE } from './overlayText'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const distanceOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const angleOf = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

// -180~180으로 감는다. 잘라 버리면 190도가 180도가 되어 계속 돌릴 수 없다 (서버도 같은 규칙)
const wrapAngle = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180

/*
 * 삭제 판정 = **글자 상자와 쓰레기통 아이콘이 실제로 겹치는가.**
 *
 * 처음에는 화면 아래쪽의 넓은 영역에 손가락이 들어오면 지웠는데, 아이콘보다 훨씬 넓어서
 * 아래 가운데에 글자를 놓으려다 지워졌다. 눈에 보이는 것끼리 닿을 때만 반응하는 편이
 * "무엇을 하면 지워지는지"가 분명하다.
 */
const rectsOverlap = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

export default function OverlayTextLayer({
  items,
  onChange,
  active,
  selectedId,
  onSelect,
  textClassName = 'sc-overlay-text',
}) {
  const layerRef = useRef(null)
  /*
   * 진행 중인 조작. state로 두면 pointermove마다 리렌더되어 영상이 끊긴다 —
   * 화면에 그릴 값(어느 글자를 잡았는지·쓰레기통 위인지)만 state로 둔다.
   *   mode 'move'      한 손가락으로 옮기는 중
   *   mode 'transform' 두 손가락 또는 손잡이로 크기·기울기를 바꾸는 중
   */
  const gestureRef = useRef(null)
  const pointersRef = useRef(new Map())
  const [draggingId, setDraggingId] = useState('')
  const [overTrash, setOverTrash] = useState(false)
  /*
   * 삭제 판정은 ref를 믿는다. state는 빨간 쓰레기통을 그리기 위한 것이고, 마지막 pointermove와
   * pointerup이 같은 틱에 몰리면 state가 아직 옛 값일 수 있다 — 그러면 놓았는데 안 지워진다.
   */
  const overTrashRef = useRef(false)
  const markOverTrash = (value) => {
    overTrashRef.current = value
    setOverTrash(value)
  }

  const rectOf = () => layerRef.current?.getBoundingClientRect()

  // 포인터 위치를 프레임 기준 %로. 프레임 밖으로 끌어도(포인터를 붙잡고 있다) 0~100으로 자른다
  const percentFrom = (point) => {
    const rect = rectOf()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      left: ((point.x - rect.left) / rect.width) * 100,
      top: ((point.y - rect.top) / rect.height) * 100,
    }
  }

  const itemById = (id) => items.find((t) => t.id === id)
  const patch = (id, partial) => onChange(items.map((t) => (t.id === id ? { ...t, ...partial } : t)))

  /** 글자 블록의 화면상 중심. 회전은 중심축이라 돌아가도 이 점은 그대로다 */
  const centerOfText = (id) => {
    const node = layerRef.current?.querySelector(`[data-overlay-id="${id}"]`)
    const box = node?.getBoundingClientRect()
    if (!box) return null
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
  }

  /**
   * 글자를 이 자리(프레임 기준 %)로 옮기면 쓰레기통 아이콘에 닿는지.
   *
   * 옮긴 **뒤**의 DOM을 재지 않고 자리를 미리 계산하는 이유: 위치는 리액트 상태로 바뀌므로
   * 다시 그려지기 전에는 DOM이 아직 이전 자리다. 그 값을 쓰면 판정이 한 프레임씩 늦어
   * 아이콘을 이미 지났는데 빨갛게 안 변하는 것처럼 보인다.
   *
   * 글자 상자 크기는 옮기는 동안 바뀌지 않으므로 지금 것을 그대로 쓴다.
   * 기울인 글자는 getBoundingClientRect가 회전까지 감싼 사각형을 주는데, 눈에 보이는 범위와
   * 가까우므로 그대로 쓴다.
   */
  const willTouchTrash = (id, nextPercent) => {
    const layer = rectOf()
    const node = layerRef.current?.querySelector(`[data-overlay-id="${id}"]`)
    const trash = layerRef.current?.querySelector('.sc-trash')
    if (!layer || !node || !trash) return false

    const box = node.getBoundingClientRect()
    const cx = layer.left + (nextPercent.left / 100) * layer.width
    const cy = layer.top + (nextPercent.top / 100) * layer.height
    const moved = {
      left: cx - box.width / 2,
      right: cx + box.width / 2,
      top: cy - box.height / 2,
      bottom: cy + box.height / 2,
    }
    return rectsOverlap(moved, trash.getBoundingClientRect())
  }

  /** 두 점(또는 중심-포인터)을 기준 벡터로 삼아 크기·기울기를 잡는다. 손잡이와 핀치가 같은 계산을 쓴다 */
  const beginTransform = (id, from, to) => {
    const item = itemById(id)
    if (!item) return
    gestureRef.current = {
      id,
      mode: 'transform',
      distance: Math.max(1, distanceOf(from, to)), // 0으로 나누지 않게
      angle: angleOf(from, to),
      size: item.size ?? 1,
      rotate: item.rotate ?? 0,
      // 손잡이는 중심이 고정이고, 핀치는 두 손가락 사이가 기준이다
      pivot: null,
    }
    markOverTrash(false)
  }

  const onPointerDown = (event) => {
    if (!active) return
    const point = { x: event.clientX, y: event.clientY }

    const handleNode = event.target.closest?.('.sc-overlay-handle')
    const textNode = event.target.closest?.('[data-overlay-id]')

    // 빈 곳을 누르면 선택을 푼다 — 고른 글자에만 손잡이가 뜨므로 이게 "손잡이 감추기"도 된다
    if (!textNode) {
      onSelect?.('')
      return
    }
    const id = textNode.dataset.overlayId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, point)
    onSelect?.(id)

    if (handleNode) {
      // 손잡이 — 글자 중심에서 손가락까지가 기준 벡터다. 멀어지면 커지고 돌리면 기울어진다
      const center = centerOfText(id)
      if (center) {
        beginTransform(id, center, point)
        gestureRef.current.pivot = center
      }
      return
    }

    if (pointersRef.current.size >= 2) {
      // 두 번째 손가락 — 핀치로 넘어간다. 옮기던 것을 멈추고 크기·기울기 모드로
      const [a, b] = [...pointersRef.current.values()]
      beginTransform(id, a, b)
      setDraggingId(id)
      return
    }

    // 한 손가락 — 옮기기. 잡은 지점과 글자 중심의 차이를 기억한다(없으면 손가락 아래로 순간이동한다)
    const item = itemById(id)
    const pos = percentFrom(point)
    if (!item || !pos) return
    gestureRef.current = {
      id,
      mode: 'move',
      dx: item.left - pos.left,
      dy: item.top - pos.top,
    }
    setDraggingId(id)
    markOverTrash(false)
  }

  const onPointerMove = (event) => {
    const gesture = gestureRef.current
    if (!gesture) return
    const point = { x: event.clientX, y: event.clientY }
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, point)

    if (gesture.mode === 'transform') {
      // 손잡이면 중심이 기준점, 핀치면 나머지 한 손가락이 기준점이다
      const points = [...pointersRef.current.values()]
      const from = gesture.pivot ?? points[0]
      const to = gesture.pivot ? point : points[1]
      if (!from || !to) return

      const distance = Math.max(1, distanceOf(from, to))
      patch(gesture.id, {
        size: clamp((gesture.size * distance) / gesture.distance, MIN_TEXT_SIZE, MAX_TEXT_SIZE),
        rotate: wrapAngle(gesture.rotate + (angleOf(from, to) - gesture.angle)),
      })
      return
    }

    const pos = percentFrom(point)
    if (!pos) return
    const next = {
      left: clamp(Math.round(pos.left + gesture.dx), 0, 100),
      top: clamp(Math.round(pos.top + gesture.dy), 0, 100),
    }
    markOverTrash(willTouchTrash(gesture.id, next))
    patch(gesture.id, next)
  }

  const onPointerUp = (event) => {
    pointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    const gesture = gestureRef.current
    if (!gesture) return
    // 손가락이 하나 남았으면 아직 조작 중이다. 다음 down/move가 이어받는다
    if (pointersRef.current.size > 0) return

    gestureRef.current = null
    setDraggingId('')

    if (gesture.mode === 'move' && overTrashRef.current) {
      onChange(items.filter((t) => t.id !== gesture.id))
      if (selectedId === gesture.id) onSelect?.('')
    }
    markOverTrash(false)
  }

  return (
    <div
      ref={layerRef}
      className={active ? 'sc-textlayer sc-textlayer-on' : 'sc-textlayer'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {items.map((item) => {
        const on = item.id === selectedId && active
        return (
          <div
            key={item.id}
            data-overlay-id={item.id}
            className={
              [
                textClassName,
                on ? 'sc-overlay-on' : '',
                item.id === draggingId && overTrash ? 'sc-overlay-doomed' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            /* --ov-size는 크기 배율, --ov-rotate는 기울기. CSS가 프레임 폭의 6%에 배율을 곱하고
               중심축으로 돌린다 — px·절대좌표로 주면 프레임 크기가 다른 화면에서 어긋난다 */
            style={{
              top: `${item.top}%`,
              left: `${item.left}%`,
              color: item.color,
              '--ov-size': item.size ?? 1,
              '--ov-rotate': `${item.rotate ?? 0}deg`,
            }}
          >
            {item.text}
            {/* 고른 글자에만 뜨는 손잡이. 마우스에는 이것이 유일한 크기·기울기 조작이다
                (핀치가 없으므로). 폰에서도 두 손가락을 올리기 어려운 작은 글자에 쓸모가 있다 */}
            {on && (
              <span className="sc-overlay-handle" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M4 14v6h6M20 10V4h-6M20 4l-7 7M4 20l7-7" />
                </svg>
              </span>
            )}
          </div>
        )
      })}

      {/* 옮기는 중에만 나타난다. 크기·기울기를 바꾸는 중에는 버릴 일이 없다 */}
      {draggingId && gestureRef.current?.mode === 'move' && (
        <div className={overTrash ? 'sc-trash sc-trash-hot' : 'sc-trash'} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </div>
      )}
    </div>
  )
}
