/*
 * 9:16 프레임 안에서 영상의 어느 부분을 보여줄지 계산한다. (가이드 4절 "9:16 비율 맞추기")
 *
 * **편집기(제작 플로우 ②)와 피드가 이 모듈 하나를 함께 쓴다.** 같은 값이 두 화면에서 다르게
 * 그려지면 "미리보기에서 맞춰 놓은 화면이 피드에서 어긋난다" — 이 기능이 존재할 이유가 사라진다.
 * 그래서 공식도 DOM 구조(cropFrame.css)도 여기 한 곳에만 둔다.
 *
 * ── DOM 계약 ────────────────────────────────────────────────────────────────
 *   <div class="9:16 프레임" style="position:relative; overflow:hidden">
 *     <div class="crop-pan"   style={cropPanStyle(crop)}>
 *       <video class="crop-media" style={cropMediaStyle(crop, size)} />
 *     </div>
 *   </div>
 *
 * ── 값의 뜻 ────────────────────────────────────────────────────────────────
 *   scale    1 = 프레임을 꽉 채우는 기본 크기(cover). 그보다 작을 수 없다 — 줄이면 빈 자리가 생긴다
 *   offsetX  프레임 **폭**의 몇 배만큼 좌우로 밀지. 0 = 가운데, 음수 = 왼쪽
 *   offsetY  프레임 **높이** 기준으로 위아래
 *
 * 픽셀이 아니라 프레임 기준 비율인 이유: 폰과 데스크톱의 프레임 크기가 달라 픽셀로 저장하면
 * 맞춰 놓은 위치가 다른 기기에서 엉뚱한 곳이 된다 (overlay_texts의 좌표와 같은 이유).
 *
 * translate의 %가 .crop-pan(=프레임 크기) 기준으로 계산되는 것이 핵심이다. 영상 요소에 직접
 * translate를 걸면 %가 **영상 자신의 크기**(cover라 프레임보다 크다) 기준이 되어 배율만큼
 * 어긋난다. 그래서 미는 층과 키우는 층을 나눴다.
 */

import { FRAME_RATIO } from './videoFile'
import './cropFrame.css'

export const DEFAULT_CROP = { scale: 1, offsetX: 0, offsetY: 0 }

export const MIN_SCALE = 1
// 3배까지. 더 키우면 1080p 영상도 눈에 띄게 뭉개진다
export const MAX_SCALE = 3

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/**
 * 프레임을 덮으려면 가로·세로로 각각 몇 배가 되어야 하는지. 둘 중 하나는 항상 1이다
 * (넓은 영상이면 가로만, 긴 영상이면 세로만 넘친다).
 * 크기를 모르면 null — 그 경우 호출부는 기본 cover 표시로 둔다.
 */
export function coverOf(size) {
  if (!size?.width || !size?.height) return null
  const ratio = size.width / size.height
  return {
    x: Math.max(1, ratio / FRAME_RATIO),
    y: Math.max(1, FRAME_RATIO / ratio),
  }
}

/**
 * 밀 수 있는 최대치(프레임 기준 비율). 넘겨서 밀면 프레임에 빈 자리가 보인다.
 * 넘치는 양의 절반이 한쪽으로 갈 수 있는 최대다.
 */
export function maxOffsetOf(cover, scale) {
  return {
    x: Math.max(0, (cover.x * scale - 1) / 2),
    y: Math.max(0, (cover.y * scale - 1) / 2),
  }
}

/** 값을 가능한 범위 안으로 자른다. 배율을 줄이면 이동 한계도 함께 줄어드므로 매번 다시 잘라야 한다 */
export function clampCrop(crop, size) {
  const scale = clamp(crop?.scale ?? 1, MIN_SCALE, MAX_SCALE)
  const cover = coverOf(size)
  if (!cover) return { scale, offsetX: 0, offsetY: 0 }

  const max = maxOffsetOf(cover, scale)
  return {
    scale,
    offsetX: clamp(crop?.offsetX ?? 0, -max.x, max.x),
    offsetY: clamp(crop?.offsetY ?? 0, -max.y, max.y),
  }
}

export function isDefaultCrop(crop) {
  return !crop || (crop.scale === 1 && crop.offsetX === 0 && crop.offsetY === 0)
}

/**
 * 영상 요소 스타일. 크기를 모르거나 손대지 않은 크롭이면 undefined —
 * 그때는 cropFrame.css의 기본값(100% + cover)이 그대로 쓰이고, 이는 예전 표시와 완전히 같다.
 */
export function cropMediaStyle(crop, size) {
  const cover = coverOf(size)
  if (!cover || isDefaultCrop(crop)) return undefined
  return {
    width: `${cover.x * crop.scale * 100}%`,
    height: `${cover.y * crop.scale * 100}%`,
  }
}

/** 미는 층 스타일. 손대지 않았으면 transform 자체를 걸지 않는다(합성 레이어를 만들지 않게) */
export function cropPanStyle(crop) {
  if (isDefaultCrop(crop)) return undefined
  return { transform: `translate(${crop.offsetX * 100}%, ${crop.offsetY * 100}%)` }
}
