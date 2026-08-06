import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createShorts, uploadVideoFile } from './shortsApi'
import '../member/member.css'
import './shortsUpload.css'

// 서버(ShortsCreateRequest)와 같은 규칙 — 최종 차단은 서버가 한다
const MIN_SEC = 5
const MAX_SEC = 30
const MAX_CAPTION = 500
// 용량 상한은 가이드 7절의 미정 항목이라 우선 50MB로 둔다 (정해지면 서버 검증도 함께 추가)
const MAX_BYTES = 50 * 1024 * 1024
// mp4 전용 확정 (가이드 7절). shortsApi.uploadVideoToStorage도 이 값에 맞춰 고정돼 있다
const VIDEO_MIME = 'video/mp4'

// 피드 프레임 비율. 영상은 여기에 object-fit:cover로 들어가므로 남는 쪽이 잘려나간다
const FRAME_RATIO = 9 / 16
// 이 정도 이상 잘릴 때만 경고한다 (1~2% 차이까지 알릴 필요는 없다)
const CROP_WARN_THRESHOLD = 10

// 길이와 해상도를 파일을 올리기 전에 브라우저에서 미리 읽는다 (가이드 5절)
function readMetadata(file) {
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
      reject(new Error('영상 정보를 읽을 수 없습니다. mp4 파일인지 확인해 주세요.'))
    }
    video.src = url
  })
}

/**
 * 9:16 프레임에 cover로 넣을 때 잘려나가는 비율. 막지는 않고 미리 알려주기 위한 계산이다.
 * 영상이 프레임보다 가로로 넓으면 높이에 맞춰 확대되며 좌우가, 반대면 위아래가 잘린다.
 */
function cropInfo(width, height) {
  if (!width || !height) return null
  const ratio = width / height
  const visible = ratio > FRAME_RATIO ? FRAME_RATIO / ratio : ratio / FRAME_RATIO
  return {
    axis: ratio > FRAME_RATIO ? '좌우' : '위아래',
    percent: Math.round((1 - visible) * 100),
  }
}

export default function ShortsUploadPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [duration, setDuration] = useState(null) // 초 단위 실수
  const [size, setSize] = useState(null) // { width, height }
  const [previewUrl, setPreviewUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [fileError, setFileError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [step, setStep] = useState('') // 진행 상황 안내 ('' = 대기)

  // 미리보기용 blob URL은 다 쓰면 반드시 해제한다 (놔두면 메모리에 남는다)
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const resetSelection = () => {
    setFile(null)
    setDuration(null)
    setSize(null)
    setPreviewUrl('')
  }

  const onFileChange = async (e) => {
    const selected = e.target.files?.[0]
    setFileError('')
    setSubmitError('')
    if (!selected) {
      resetSelection()
      return
    }

    // mp4만 허용. 브라우저마다 재생 가능한 코덱이 달라 포맷을 하나로 고정한다
    if (selected.type !== VIDEO_MIME) {
      resetSelection()
      setFileError('mp4 영상만 올릴 수 있습니다.')
      return
    }
    if (selected.size > MAX_BYTES) {
      resetSelection()
      setFileError(`파일이 너무 큽니다. ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`)
      return
    }

    let meta
    try {
      meta = await readMetadata(selected)
    } catch (err) {
      resetSelection()
      setFileError(err.message)
      return
    }

    const seconds = meta.duration
    if (!Number.isFinite(seconds)) {
      resetSelection()
      setFileError('영상 길이를 확인할 수 없습니다. 다른 파일로 시도해 주세요.')
      return
    }
    if (seconds < MIN_SEC || seconds > MAX_SEC) {
      resetSelection()
      setFileError(`${MIN_SEC}~${MAX_SEC}초 영상만 올릴 수 있습니다. (선택한 영상: ${seconds.toFixed(1)}초)`)
      return
    }

    // 비율은 막지 않는다 — 9:16이 아니어도 올릴 수 있고, 얼마나 잘리는지만 아래에서 알려준다
    setFile(selected)
    setDuration(seconds)
    setSize({ width: meta.width, height: meta.height })
    setPreviewUrl(URL.createObjectURL(selected))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!file || duration === null) {
      setFileError('올릴 영상을 선택해 주세요.')
      return
    }

    try {
      // 1) 파일을 백엔드로 보내면 백엔드가 Storage에 넣고 공개 URL을 돌려준다
      setStep('영상을 올리는 중…')
      const { videoUrl } = await uploadVideoFile(file)

      // 2) 받은 URL과 정보를 등록
      setStep('정보를 저장하는 중…')
      await createShorts({
        videoUrl,
        thumbnailUrl: null, // 썸네일 생성은 나중 단계
        caption: caption.trim() || null,
        durationSec: Math.round(duration),
      })

      navigate('/shorts', { replace: true }) // 피드가 다시 마운트되며 새 영상을 불러온다
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setStep('')
    }
  }

  // Storage 설정은 서버(.env)에만 있으므로 프론트에서 미리 확인할 수 없다.
  // 설정이 빠져 있으면 업로드 요청 시 서버가 이유를 담은 메시지를 돌려주고, submitError로 표시된다
  const submitting = step !== ''
  const crop = size ? cropInfo(size.width, size.height) : null

  return (
    <main className="auth-page">
      <h1>숏츠 올리기</h1>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label>
          영상 파일 (mp4, {MIN_SEC}~{MAX_SEC}초, {Math.floor(MAX_BYTES / 1024 / 1024)}MB 이하)
          <input
            type="file"
            accept="video/mp4"
            onChange={onFileChange}
            disabled={submitting}
            aria-invalid={Boolean(fileError)}
          />
          {fileError && <p className="field-error">{fileError}</p>}
        </label>

        {previewUrl && (
          <div className="su-preview">
            {/* 9:16 세로 프레임에서 어떻게 보일지 미리 확인 — 피드와 같은 잘림(cover)을 적용 */}
            <video src={previewUrl} muted loop playsInline autoPlay />
            <p className="su-meta">
              {size && `${size.width}×${size.height} · `}
              {duration.toFixed(1)}초 · {(file.size / 1024 / 1024).toFixed(1)}MB
            </p>
            {crop && crop.percent >= CROP_WARN_THRESHOLD && (
              <p className="su-crop-warn">
                9:16 세로 비율이 아니라 <strong>{crop.axis}가 약 {crop.percent}% 잘립니다.</strong>
                <br />
                위 미리보기가 피드에서 보일 모습 그대로입니다. 그대로 올려도 됩니다.
              </p>
            )}
          </div>
        )}

        <label>
          설명 (선택)
          <input
            type="text"
            value={caption}
            maxLength={MAX_CAPTION}
            onChange={(e) => setCaption(e.target.value)}
            disabled={submitting}
            placeholder="예: 산책 나온 우리 강아지 🐾"
          />
        </label>

        {submitError && <p className="submit-error">{submitError}</p>}
        <button type="submit" disabled={submitting || !file}>
          {submitting ? step : '올리기'}
        </button>
      </form>
      <p className="auth-switch">
        <Link to="/shorts">← 숏츠로</Link>
      </p>
    </main>
  )
}
