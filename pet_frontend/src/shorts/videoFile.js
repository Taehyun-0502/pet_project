/*
 * 올릴 영상 파일의 규칙과 검사. ShortsUploadPage(기존 화면)와 제작 플로우(create/CameraPage)가
 * 함께 쓴다 — 두 화면이 다른 규칙으로 막으면 한쪽에서 통과한 파일이 다른 쪽에서 튕긴다.
 *
 * 최종 차단은 서버다(ShortsService.uploadVideo·ShortsCreateRequest). 여기서 먼저 막는 이유는
 * 50MB를 다 올린 뒤에 "30초가 넘습니다"를 듣지 않게 하려는 것뿐이다.
 */

// 서버(ShortsCreateRequest의 @Min/@Max)와 같은 값.
// 가이드의 15초 하한을 5초로 완화한 상태이며, 바꾸려면 서버와 함께 바꿔야 한다
export const MIN_SEC = 5
export const MAX_SEC = 30

// 용량 상한은 가이드 7절의 미정 항목이라 우선 50MB로 둔다 (정해지면 서버 검증도 함께 추가)
export const MAX_BYTES = 50 * 1024 * 1024

/*
 * 허용 형식. 서버(ShortsService.uploadVideo)도 같은 목록으로 최종 검사한다.
 *
 * mp4 하나였다가 webm을 더했다 — 카메라 녹화(MediaRecorder) 때문이다. 크롬 계열은 webm만
 * 뱉고 사파리/iOS는 mp4를 주므로, 둘 다 받지 않으면 한쪽에서는 녹화가 아예 성립하지 않는다.
 */
export const VIDEO_MIMES = ['video/mp4', 'video/webm']
// <input type="file">의 accept 값. 목록과 어긋나면 고를 수 있는데 튕기는 파일이 생긴다
export const VIDEO_ACCEPT = VIDEO_MIMES.join(',')

/** 파라미터를 뗀 기본 MIME. 'video/webm;codecs=vp9,opus' → 'video/webm' */
export function baseMime(type) {
  if (!type) return ''
  return type.split(';')[0].trim().toLowerCase()
}

export const isAllowedVideoType = (type) => VIDEO_MIMES.includes(baseMime(type))

// 피드 프레임 비율. 영상은 여기에 object-fit:cover로 들어가므로 남는 쪽이 잘려나간다
export const FRAME_RATIO = 9 / 16

// 이 정도 이상 잘릴 때만 경고한다 (1~2% 차이까지 알릴 필요는 없다)
export const CROP_WARN_THRESHOLD = 10

export const maxMegabytes = () => Math.floor(MAX_BYTES / 1024 / 1024)

// 길이와 해상도를 파일을 올리기 전에 브라우저에서 미리 읽는다 (가이드 5절)
export function readMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('영상 정보를 읽을 수 없습니다. mp4 또는 webm 파일인지 확인해 주세요.'))
    }
    video.src = url
  })
}

/**
 * 9:16 프레임에 cover로 넣을 때 잘려나가는 비율. 막지는 않고 미리 알려주기 위한 계산이다.
 * 영상이 프레임보다 가로로 넓으면 높이에 맞춰 확대되며 좌우가, 반대면 위아래가 잘린다.
 */
export function cropInfo(width, height) {
  if (!width || !height) return null
  const ratio = width / height
  const visible = ratio > FRAME_RATIO ? FRAME_RATIO / ratio : ratio / FRAME_RATIO
  return {
    axis: ratio > FRAME_RATIO ? '좌우' : '위아래',
    percent: Math.round((1 - visible) * 100),
  }
}

/**
 * 고른(또는 녹화한) 영상을 검사하고 메타데이터까지 읽어 돌려준다.
 * 통과하지 못하면 **사용자에게 그대로 보여줄 문장**을 담아 throw한다 (호출부는 err.message를 쓴다).
 *
 * 비율은 막지 않는다 — 9:16이 아니어도 올릴 수 있고, 얼마나 잘리는지만 cropInfo로 알려준다.
 *
 * @param options.knownDuration 길이를 이미 아는 경우(초). **녹화본에는 반드시 넘겨야 한다.**
 *   MediaRecorder가 만든 webm에는 길이가 안 적혀 있어(스트리밍용으로 쓰라고 비워둔다)
 *   `video.duration`이 Infinity로 나온다. 녹화한 쪽이 잰 실제 시간을 쓰는 것이 정확하기도 하다.
 *
 * @param options.maxSec 길이 상한(초). **null이면 상한 없음.**
 *   제작 플로우는 ②에서 구간을 자르므로 원본이 30초보다 길어도 된다 — 그쪽이 null을 넘긴다.
 *   반면 기존 업로드 화면(ShortsUploadPage)에는 자르는 단계가 없어 원본이 곧 최종 길이라
 *   기본값(MAX_SEC)을 그대로 쓴다. 하한(MIN_SEC)은 어느 쪽이든 같다 — 5초보다 짧은 원본에서는
 *   5초짜리 구간 자체를 만들 수 없다.
 */
export async function pickVideoFile(file, { knownDuration = null, maxSec = MAX_SEC } = {}) {
  if (!isAllowedVideoType(file.type)) {
    throw new Error('mp4 또는 webm 영상만 올릴 수 있습니다.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`파일이 너무 큽니다. ${maxMegabytes()}MB 이하만 올릴 수 있습니다.`)
  }

  // 길이를 알아도 해상도는 읽어야 한다 — 길이 없는 webm도 가로·세로는 정상적으로 알려준다
  const meta = await readMetadata(file)
  const seconds = knownDuration ?? meta.duration
  if (!Number.isFinite(seconds)) {
    throw new Error('영상 길이를 확인할 수 없습니다. 다른 파일로 시도해 주세요.')
  }
  if (seconds < MIN_SEC) {
    throw new Error(
      `${MIN_SEC}초 이상인 영상만 쓸 수 있습니다. (선택한 영상: ${seconds.toFixed(1)}초)`
    )
  }
  if (maxSec != null && seconds > maxSec) {
    throw new Error(
      `${MIN_SEC}~${maxSec}초 영상만 올릴 수 있습니다. (선택한 영상: ${seconds.toFixed(1)}초)`
    )
  }

  return { file, duration: seconds, width: meta.width, height: meta.height }
}
