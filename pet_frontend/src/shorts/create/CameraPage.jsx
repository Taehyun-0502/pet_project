/*
 * ① 카메라 페이지. (가이드 3절 · 10절 2단계)
 *
 * 화면 전체가 카메라 미리보기이고, 왼쪽 아래로 갤러리에서 고르거나 가운데 아래 버튼으로 녹화한다.
 * 녹화본이든 파일이든 **같은 경로**(onPicked)로 나가므로 다음 페이지는 출처를 모른다.
 *
 * 카메라를 못 쓰는 경우가 여럿이라 화면이 그만큼 갈린다. 어느 경우든 **파일 선택은 항상 남는다** —
 * 카메라가 안 되는 기기에서 만들기 자체가 막히면 안 된다.
 *   unsupported  HTTPS가 아니거나(배포 EC2에 https가 없으면 여기다) 브라우저가 지원하지 않음
 *   denied       사용자가 권한을 거부
 *   error        카메라 없음 / 다른 앱이 점유
 *   muted        카메라만 켜지고 마이크는 막힘 → 소리 없는 녹화가 된다
 */

import { useRef, useState } from 'react'
import { MAX_SEC, MIN_SEC, VIDEO_ACCEPT, maxMegabytes, pickVideoFile } from '../videoFile'
import useCameraRecorder from './useCameraRecorder'

export default function CameraPage({ goBack, onPicked }) {
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  // 녹화가 끝나면 파일 선택과 똑같이 검사한다 — 최소 길이(5초)에 못 미치면 여기서 걸린다
  const handleRecorded = async (file, seconds) => {
    setError('')
    setReading(true)
    try {
      onPicked(await pickVideoFile(file, { knownDuration: seconds }), 'record')
    } catch (err) {
      setError(err.message)
    } finally {
      setReading(false)
    }
  }

  const camera = useCameraRecorder({ maxSec: MAX_SEC, onDone: handleRecorded })

  /*
   * 핀치 확대. 두 손가락 **간격의 비율**로 직전 배율에 곱한다.
   * 절대값을 쓰지 않는 이유: zoom 단위가 기기마다 달라(1~10인 기기도, 100~400인 기기도 있다)
   * 손가락 몇 px에 몇 배를 더할지 정할 수 없다. 비율이면 어느 기기에서나 같은 손맛이 난다.
   * (브라우저의 페이지 확대가 제스처를 가로채지 않게 .sc-camera .sc-viewport에 touch-action:none)
   */
  const pinchRef = useRef(null)
  const touchGap = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

  const onTouchStart = (e) => {
    if (e.touches.length !== 2 || !camera.zoomRange) return
    pinchRef.current = { gap: touchGap(e.touches), zoom: camera.zoom }
  }
  const onTouchMove = (e) => {
    const from = pinchRef.current
    if (!from || e.touches.length !== 2) return
    camera.setZoom(from.zoom * (touchGap(e.touches) / from.gap))
  }
  // 한 손가락만 떼도 비율의 기준이 사라지므로 제스처를 끝낸다 (다시 모으면 새로 시작한다)
  const endPinch = () => {
    pinchRef.current = null
  }

  // 버튼 한 번에 움직일 폭. 기기 step은 0.01처럼 잘아서 그대로 쓰면 눌러도 티가 안 난다
  const zoomStep = camera.zoomRange
    ? Math.max(camera.zoomRange.step, (camera.zoomRange.max - camera.zoomRange.min) / 10)
    : 0

  const onFileChange = async (e) => {
    const selected = e.target.files?.[0]
    setError('')
    if (!selected) return

    setReading(true)
    try {
      // 상한을 두지 않는다 — 긴 원본을 받아 ② 길이/비율 화면에서 5~30초로 자른다
      onPicked(await pickVideoFile(selected, { maxSec: null }), 'upload')
    } catch (err) {
      setError(err.message)
    } finally {
      setReading(false)
      // 같은 파일을 다시 고를 수 있게 비운다 — 값이 같으면 change가 오지 않는다
      e.target.value = ''
    }
  }

  const busy = reading || camera.recording
  const remaining = Math.max(0, MIN_SEC - camera.elapsed)

  return (
    <div className="sc-page sc-camera">
      <header className="sc-bar">
        <button
          type="button"
          className="sc-back"
          onClick={goBack}
          disabled={camera.recording}
          aria-label="닫기"
        >
          ✕
        </button>
        <span className="sc-title">새 숏츠</span>
        {camera.status === 'ready' ? (
          <button
            type="button"
            className="sc-back"
            onClick={camera.flip}
            disabled={camera.recording}
            aria-label="전면·후면 전환"
          >
            ⟲
          </button>
        ) : (
          <span className="sc-bar-spacer" aria-hidden="true" />
        )}
      </header>

      <div
        className="sc-viewport sc-viewport-frame"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endPinch}
        onTouchCancel={endPinch}
      >
        {/*
          미리보기 틀. ②·피드와 같은 9:16 규격이라 여기서 잡은 구도가 뒤 단계에서 달라지지 않는다.

          **틀을 9:16으로 고정하는 것이 핵심이다.** 스트림도 9:16이라 cover가 여기서 더 자르지
          않는다. 예전처럼 뷰포트(상단바·컨트롤을 뺀 나머지 — 9:16이 아니다)에 그냥 cover를 걸면
          그 비율 차이만큼 **한 번 더** 잘려 화면이 확대돼 보인다. 처음 증상이 정확히 그거였다.
        */}
        <div className="sc-frame">
          {/*
            실시간 미리보기. muted가 없으면 자기 소리가 스피커로 되돌아 하울링이 나고,
            playsInline이 없으면 iOS가 전체화면 재생기로 띄운다.
            전면 카메라는 좌우를 뒤집어 보여준다 — 폰 카메라 앱과 같은 동작이라 이게 자연스럽다.
            (기본은 후면이라 대개 뒤집지 않는다)
            (저장되는 파일은 뒤집히지 않는다. 화면 속 글자는 미리보기에서만 거울처럼 보인다)
          */}
          <video
            ref={camera.videoRef}
            className={camera.facing === 'user' ? 'sc-cam sc-cam-mirror' : 'sc-cam'}
            muted
            playsInline
            autoPlay
          />

          {camera.status !== 'ready' && (
            <div className="sc-cam-cover">
              {camera.status === 'starting' && <p>카메라를 켜는 중…</p>}
              {camera.status === 'denied' && (
                <p>
                  카메라 사용이 <strong>거부</strong>되었습니다.
                  <br />
                  주소창의 자물쇠에서 권한을 허용하거나, 아래에서 영상을 골라주세요.
                </p>
              )}
              {camera.status === 'unsupported' && (
                <p>
                  이 환경에서는 카메라를 쓸 수 없습니다.
                  <br />
                  카메라는 <strong>https</strong> 또는 localhost에서만 켜집니다.
                  <br />
                  아래에서 영상 파일을 골라주세요.
                </p>
              )}
              {camera.status === 'error' && <p>{camera.error}</p>}
            </div>
          )}

          {/*
            확대 조절. 이 기기가 확대를 지원할 때만(zoomRange !== null) 나온다 —
            지원하지 않는 기기에서 슬라이더만 띄우면 만져도 아무 일이 없어 고장으로 보인다.
            녹화 중에도 막지 않는다(트랙 제약만 바뀌므로 녹화가 끊기지 않는다).
          */}
          {camera.zoomRange && camera.status === 'ready' && (
            <div className="sc-zoom">
              <button
                type="button"
                onClick={() => camera.setZoom(camera.zoom - zoomStep)}
                disabled={camera.zoom <= camera.zoomRange.min}
                aria-label="축소"
              >
                −
              </button>
              <input
                type="range"
                min={camera.zoomRange.min}
                max={camera.zoomRange.max}
                step={camera.zoomRange.step}
                value={camera.zoom}
                onChange={(e) => camera.setZoom(Number(e.target.value))}
                aria-label="확대 배율"
              />
              <button
                type="button"
                onClick={() => camera.setZoom(camera.zoom + zoomStep)}
                disabled={camera.zoom >= camera.zoomRange.max}
                aria-label="확대"
              >
                +
              </button>
              {/* 배율은 min을 1배로 놓고 센다 — min이 100인 기기에서 "×100"이라고 쓸 수는 없다 */}
              <em>×{(camera.zoom / camera.zoomRange.min).toFixed(1)}</em>
            </div>
          )}

          {/* 녹화 중 경과. 최소 길이를 못 채우면 버려지므로 남은 시간을 함께 알려준다 */}
          {camera.recording && (
            <div className="sc-rec-badge">
              <span className="sc-rec-live" aria-hidden="true" />
              {camera.elapsed.toFixed(1)}초 / {MAX_SEC}초
              {remaining > 0 && <em> · {Math.ceil(remaining)}초 더</em>}
            </div>
          )}

          {/* 지금 찍히는 해상도. 고를 수 있는 모드가 기기마다 달라 비율이 갈리는데,
              적어 두면 폰마다 왜 다르게 보이는지 코드를 열지 않고도 알 수 있다 */}
          {camera.size && camera.status === 'ready' && !camera.recording && (
            <span className="sc-cam-size">
              {camera.size.width}×{camera.size.height}
            </span>
          )}
        </div>
      </div>

      {camera.muted && camera.status === 'ready' && !camera.recording && (
        <p className="sc-note sc-cam-note">
          마이크 권한이 없어 <strong>소리 없이</strong> 녹화됩니다.
        </p>
      )}
      {error && <p className="sc-error">{error}</p>}

      <div className="sc-camera-controls">
        {/* 왼쪽 아래 — 갤러리에서 고르기.
            input을 label로 감싸 화면에서만 숨긴다(display:none이면 포커스를 못 받는다) */}
        <label className={busy ? 'sc-pick sc-pick-busy' : 'sc-pick'}>
          <input type="file" accept={VIDEO_ACCEPT} onChange={onFileChange} disabled={busy} />
          <span aria-hidden="true">🖼️</span>
          <em>{reading ? '읽는 중…' : '영상 고르기'}</em>
        </label>

        {/* 가운데 아래 — 탭하면 시작, 다시 탭하면 정지 */}
        <button
          type="button"
          className={camera.recording ? 'sc-record sc-record-on' : 'sc-record'}
          onClick={camera.recording ? camera.stop : camera.start}
          disabled={!camera.canRecord || reading}
          aria-label={camera.recording ? '녹화 정지' : '녹화 시작'}
        >
          <span className="sc-record-dot" aria-hidden="true" />
        </button>

        <span className="sc-camera-spacer" aria-hidden="true">
          {camera.status === 'ready' && !camera.recording && (
            <em>{MIN_SEC}~{MAX_SEC}초</em>
          )}
        </span>
      </div>

      {/* 긴 영상도 받는다 — 다음 화면에서 자른다. 그래서 여기서는 하한과 용량만 알린다 */}
      <p className="sc-note sc-cam-foot">
        mp4 · webm · {MIN_SEC}초 이상 · {maxMegabytes()}MB 이하 · 다음 단계에서 {MIN_SEC}~{MAX_SEC}초로 자릅니다
      </p>
    </div>
  )
}
