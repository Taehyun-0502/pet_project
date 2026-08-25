/*
 * 타임라인에 깔 프레임 이미지들. (가이드 6-1절 buildFilmstrip)
 *
 * 카메라 앱처럼 영상 프레임이 죽 늘어서 있어야 "어디를 자르는지"가 보인다. 시간 눈금만 있는
 * 막대는 3초 지점에 무엇이 있는지 알려주지 않아서, 결국 손잡이를 옮겨가며 미리보기로 확인하게 된다.
 *
 * 만드는 법은 seek → canvas.drawImage 반복이다. 느릴 수 있어 두 가지를 지켰다:
 *   · 실패하거나 오래 걸리면 **그냥 포기한다**. 필름스트립은 있으면 좋은 것이지 없으면
 *     못 자르는 것이 아니다 — 호출부는 빈 배열을 받으면 민 막대로 그린다.
 *   · 프레임을 한 장씩 넘겨준다(onFrame). 10장을 다 모을 때까지 빈 화면을 보여줄 이유가 없다.
 *
 * ⚠️ 원격 URL에서 프레임을 뽑으면 CORS가 맞지 않을 때 canvas가 오염(tainted)되어 toDataURL이
 * 막힌다. 여기서 다루는 것은 방금 고르거나 녹화한 **로컬 blob**이라 해당되지 않는다.
 */

// 8~12장이면 충분하다(가이드 11절). 많을수록 seek 반복이 길어진다
export const FRAME_COUNT = 10
// 한 장 크기(px). 타임라인 높이에 맞춘 9:16 조각
const FRAME_W = 27
const FRAME_H = 48
// 한 장을 이만큼 기다려도 안 오면 포기한다. 코덱에 따라 seek이 영영 안 끝나는 경우가 있다
const SEEK_TIMEOUT_MS = 2500

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
 * @param url      미리보기용 blob URL
 * @param duration 훑을 길이(초)
 * @param onFrame  (index, dataUrl) — 한 장 나올 때마다 부른다
 * @param signal   AbortSignal. 화면을 떠나면 중간에 멈춘다
 * @param offset   시작 지점(초). ②는 원본 전체를 훑지만(0), 커버 고르기는 **잘라낸 구간만**
 *                 훑어야 한다 — 커버는 그 구간 안에서만 고를 수 있기 때문이다
 * @returns 실제로 만든 장수
 */
export async function buildFilmstrip(url, duration, { onFrame, signal, offset = 0 } = {}) {
  if (!url || !Number.isFinite(duration) || duration <= 0) return 0

  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  // 프레임을 그리려면 메타데이터만으로는 부족하다 — 실제 화면 데이터가 있어야 한다
  video.preload = 'auto'

  const canvas = document.createElement('canvas')
  canvas.width = FRAME_W
  canvas.height = FRAME_H
  const ctx = canvas.getContext('2d')

  let made = 0
  try {
    await once(video, 'loadeddata', SEEK_TIMEOUT_MS * 2)

    for (let i = 0; i < FRAME_COUNT; i++) {
      if (signal?.aborted) break

      /*
       * 각 칸의 **가운데** 시점을 뽑는다. 0과 duration을 양 끝으로 잡으면 마지막 한 장이
       * 영상의 맨 끝 프레임이 되는데, 끝 프레임은 검은 화면인 경우가 많아 칸 하나를 버리게 된다.
       */
      video.currentTime = offset + (duration * (i + 0.5)) / FRAME_COUNT
      await once(video, 'seeked', SEEK_TIMEOUT_MS)
      if (signal?.aborted) break

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      onFrame?.(i, canvas.toDataURL('image/jpeg', 0.6))
      made += 1
    }
  } catch {
    // 여기까지 만든 것만 쓴다 — 몇 장이라도 있으면 없는 것보다 낫다
  } finally {
    video.removeAttribute('src')
    video.load()
  }
  return made
}
