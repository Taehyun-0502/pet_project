/*
 * 커버(썸네일) 한 장을 굽는다. (가이드 6-1절 (3))
 *
 * 고른 시점의 프레임 위에 커버 전용 글자를 canvas로 그려 jpeg Blob 하나를 만든다.
 * 영상 자막(overlayTexts)은 그리지 않는다 — 그쪽은 재생 중에 얹히는 값이고, 커버 글자는
 * 사진에 박히는 값이라 목적이 다르다(그래서 저장 배열도 나뉘어 있다).
 *
 * ⚠️ **크롭을 그대로 반영해야 한다.** 커버는 피드 카드의 poster로 깔리므로, 크롭을 무시하면
 * 재생 전에는 원본 가운데가 보이다가 재생이 시작되는 순간 화면이 튄다.
 * 아래 계산은 cropFrame.js의 DOM 배치를 캔버스로 옮긴 것이고 **같은 공식이어야 한다** —
 * 한쪽만 고치면 커버와 영상이 어긋난다.
 *
 * 로컬 blob에서 뽑으므로 canvas 오염(tainted) 문제는 없다. 원격 URL로 바꾸게 되면
 * CORS 헤더가 맞아야 toBlob이 동작한다(가이드 11절).
 */

import { coverOf } from '../cropFrame'

// 9:16 커버. 피드 카드가 폰에서 대략 이 정도라 더 키워도 눈에 띄지 않고 용량만 는다
export const THUMB_WIDTH = 720
export const THUMB_HEIGHT = 1280

/*
 * 글자 크기를 커버 폭의 비율로 잡는다. 화면 미리보기도 같은 비율(cqw)을 쓰므로,
 * 미리보기에서 본 크기가 구운 결과에서도 같다. px로 고정하면 미리보기 프레임 크기에 따라
 * 결과가 달라진다 — 작은 미리보기에서 맞춘 글자가 커버에서는 깨알같이 나온다.
 */
export const THUMB_TEXT_RATIO = 0.06

// 굽기가 이 시간을 넘으면 포기한다. seek이 영영 안 끝나는 코덱이 있다
const SEEK_TIMEOUT_MS = 4000
// 화질 0.85 — 눈에 띄는 손실 없이 2MB(서버 상한) 안에 넉넉히 들어간다
const JPEG_QUALITY = 0.85

function once(target, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener(event, handler)
      reject(new Error(`${event} timeout`))
    }, timeoutMs)
    function handler() {
      clearTimeout(timer)
      target.removeEventListener(event, handler)
      resolve()
    }
    target.addEventListener(event, handler, { once: true })
  })
}

/**
 * 크롭을 반영해 프레임을 어디에 얼마나 크게 그릴지. cropFrame.js의 DOM 배치와 **같은 계산이다**:
 *   그릴 크기 = cover 배율 × scale × 프레임 크기   (= .crop-media의 width/height)
 *   그릴 위치 = 가운데 + offset × 프레임 크기       (= .crop-pan의 translate)
 *
 * <b>export하는 이유는 검증 때문이다.</b> 화면(CSS)과 커버(canvas)가 같은 그림을 만드는지는
 * 눈으로 비교하기 어렵다 — 이 함수와 실제 DOM 위치를 재서 맞춰보면 어긋남을 바로 잡을 수 있다.
 */
export function coverDrawRect(crop, size, width, height) {
  const cover = coverOf(size)
  if (!cover) {
    // 크기를 모르면 프레임을 꽉 채운다 — cropFrame.js가 기본값에서 하는 것과 같다
    return { dx: 0, dy: 0, dw: width, dh: height }
  }
  const scale = crop?.scale ?? 1
  const dw = cover.x * scale * width
  const dh = cover.y * scale * height
  return {
    dx: (width - dw) / 2 + (crop?.offsetX ?? 0) * width,
    dy: (height - dh) / 2 + (crop?.offsetY ?? 0) * height,
    dw,
    dh,
  }
}

/**
 * @param videoUrl 미리보기용 blob URL
 * @param options.timeSec  커버로 쓸 시점(초)
 * @param options.overlays 커버 전용 글자 [{ text, top, left }] — top/left는 0~100(%), 글자 중심
 * @param options.crop     9:16 위치. 반드시 넘겨야 영상과 커버가 같은 화면이 된다
 * @param options.size     영상 원본 크기 { width, height }
 * @returns jpeg Blob. **실패하면 null** — 커버가 없다고 발행을 막지는 않는다
 */
export async function bakeThumbnail(videoUrl, { timeSec, overlays = [], crop, size }) {
  if (!videoUrl) return null

  const video = document.createElement('video')
  video.src = videoUrl
  video.muted = true
  video.playsInline = true
  video.preload = 'auto' // 메타데이터만으로는 프레임을 그릴 수 없다

  try {
    await once(video, 'loadeddata', SEEK_TIMEOUT_MS)
    video.currentTime = Math.max(0, timeSec)
    await once(video, 'seeked', SEEK_TIMEOUT_MS)

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_WIDTH
    canvas.height = THUMB_HEIGHT
    const ctx = canvas.getContext('2d')

    // 크롭 밖은 검게 — 계산이 어긋나 빈 자리가 생겨도 투명 대신 검정이 되어 카드와 이어진다
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const { dx, dy, dw, dh } = coverDrawRect(crop, size, canvas.width, canvas.height)
    ctx.drawImage(video, dx, dy, dw, dh)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    overlays.forEach((item) => {
      const text = item.text?.trim()
      if (!text) return

      /*
       * 화면(CSS)과 같은 계산이어야 한다:
       *   크기  = 프레임 폭 × 6%(THUMB_TEXT_RATIO) × 배율   (= CSS의 calc(6cqw * --ov-size))
       *   기울기 = 글자 중심을 축으로 회전                   (= CSS의 translate(-50%,-50%) rotate(...))
       * 한쪽만 고치면 커버와 영상의 글자가 어긋난다.
       */
      const fontSize = canvas.width * THUMB_TEXT_RATIO * (item.size ?? 1)
      ctx.font = `800 ${fontSize}px system-ui, "Segoe UI", Roboto, sans-serif`
      // 색이 없으면 흰색 — 이 필드가 생기기 전 데이터가 그 경우이고, 서버도 같은 기본값을 쓴다
      ctx.fillStyle = item.color || '#ffffff'
      // 밝은 화면 위에서도 읽히게 그림자를 겹친다 (.sc-overlay-text의 text-shadow와 같은 의도).
      // 글자마다 크기가 달라 그림자도 그때그때 맞춘다
      ctx.shadowColor = 'rgba(0,0,0,.75)'
      ctx.shadowBlur = fontSize * 0.3
      ctx.shadowOffsetY = fontSize * 0.08

      /*
       * 좌표를 중심으로 옮긴 뒤 그 자리에서 돌리고 (0,0)에 그린다.
       * fillText에 좌표를 주고 회전시키면 원점(캔버스 왼쪽 위)을 축으로 돌아 글자가 딴 데로 날아간다.
       */
      ctx.save()
      ctx.translate((item.left / 100) * canvas.width, (item.top / 100) * canvas.height)
      ctx.rotate(((item.rotate ?? 0) * Math.PI) / 180)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    })

    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  } catch {
    // 커버는 없으면 첫 프레임이 쓰인다. 굽기 실패로 발행을 막지 않는다
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}
