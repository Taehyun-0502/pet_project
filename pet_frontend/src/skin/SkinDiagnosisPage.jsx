import React, { useState, useRef, useEffect } from 'react'
import { BACKEND_URL } from '../config'

// 페이지 고정 타이틀 상수를 컴포넌트 외부에 선언하여 useState 최소화
const PAGE_TITLE = '🐶 피부 질환 스크리닝 & AI 진단'

// 페이지 안내 서브 타이틀 상수
const PAGE_SUBTITLE = '환부 사진을 업로드하고 크롭 영역을 지정하여 1차 정상 스크리닝 및 12종 정밀 진단을 받으세요.'

// 업로드 영역 드래그 앤 드롭 문구 상수
const UPLOAD_PLACEHOLDER = '사진을 촬영하거나 파일 선택'

export default function SkinDiagnosisPage() {
  // 비제어 파일 입력 컴포넌트 참조 객체
  const fileInputRef = useRef(null)

  // 환부 영역 지정 캔버스 참조 객체
  const canvasRef = useRef(null)

  // 원본 이미지 URL 상태
  const [rawImageSrc, setRawImageSrc] = useState(null)

  // 환부 잘라내기 미리보기 URL 상태
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null)

  // 잘라낸 이미지 File 객체 상태
  const [croppedFile, setCroppedFile] = useState(null)

  // 1차 이진 스크리닝 진단 결과 상태
  const [binaryResult, setBinaryResult] = useState(null)

  // 2차 12종 세부 질환 정밀 진단 결과 상태
  const [multiResult, setMultiResult] = useState(null)

  // 1차 스크리닝 서버 로딩 상태
  const [loadingBinary, setLoadingBinary] = useState(false)

  // 2차 정밀 진단 서버 로딩 상태
  const [loadingMulti, setLoadingMulti] = useState(false)

  // 에러 메시지 상태
  const [error, setError] = useState(null)

  // 캔버스 크롭 진행 상태
  const [isCropping, setIsCropping] = useState(false)

  // 캔버스 크롭 박스 상대 좌표 및 크기 상태
  const [cropBox, setCropBox] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })

  // 마우스/터치 드래그 중 여부 상태
  const [isDragging, setIsDragging] = useState(false)

  // 드래그 시작 좌표 상태
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 이미지 선택 및 파일 검증 이벤트 핸들러
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.')
      return
    }

    setError(null)
    setBinaryResult(null)
    setMultiResult(null)
    setCroppedPreviewUrl(null)
    setCroppedFile(null)

    const url = URL.createObjectURL(file)
    setRawImageSrc(url)
    setIsCropping(true)
    setCropBox({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  }

  // 드래그 앤 드롭 이미지 배치 이벤트 핸들러
  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInputRef.current.files = dataTransfer.files
      handleFileChange({ target: { files: dataTransfer.files } })
    }
  }

  // 드래그 오버 기본 동작 방지 이벤트 핸들러
  const handleDragOver = (e) => {
    e.preventDefault()
  }

  // 캔버스 크롭 가이드 및 선택 영역 렌더링 효과
  useEffect(() => {
    if (!rawImageSrc || !canvasRef.current || !isCropping) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.src = rawImageSrc

    img.onload = () => {
      const maxWidth = 420
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const cropX = cropBox.x * canvas.width
      const cropY = cropBox.y * canvas.height
      const cropW = cropBox.width * canvas.width
      const cropH = cropBox.height * canvas.height

      ctx.clearRect(cropX, cropY, cropW, cropH)
      ctx.drawImage(
        img,
        cropBox.x * img.width,
        cropBox.y * img.height,
        cropBox.width * img.width,
        cropBox.height * img.height,
        cropX,
        cropY,
        cropW,
        cropH
      )

      ctx.strokeStyle = '#6366F1'
      ctx.lineWidth = 3
      ctx.strokeRect(cropX, cropY, cropW, cropH)
    }
  }, [rawImageSrc, cropBox, isCropping])

  // 좌표 계산 헬퍼 함수
  const getNormalizedCoords = (clientX, clientY) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return { x, y }
  }

  // 캔버스 마우스 다운 이벤트 핸들러
  const handleCanvasMouseDown = (e) => {
    const coords = getNormalizedCoords(e.clientX, e.clientY)
    setIsDragging(true)
    setDragStart(coords)
    setCropBox({ x: coords.x, y: coords.y, width: 0.05, height: 0.05 })
  }

  // 캔버스 마우스 이동 이벤트 핸들러
  const handleCanvasMouseMove = (e) => {
    if (!isDragging) return
    const current = getNormalizedCoords(e.clientX, e.clientY)
    const x = Math.min(dragStart.x, current.x)
    const y = Math.min(dragStart.y, current.y)
    const width = Math.max(0.05, Math.abs(current.x - dragStart.x))
    const height = Math.max(0.05, Math.abs(current.y - dragStart.y))
    setCropBox({ x, y, width, height })
  }

  // 캔버스 마우스 업 이벤트 핸들러
  const handleCanvasMouseUp = () => {
    setIsDragging(false)
  }

  // 모바일 터치 시작 이벤트 핸들러
  const handleCanvasTouchStart = (e) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const coords = getNormalizedCoords(touch.clientX, touch.clientY)
    setIsDragging(true)
    setDragStart(coords)
    setCropBox({ x: coords.x, y: coords.y, width: 0.05, height: 0.05 })
  }

  // 모바일 터치 이동 이벤트 핸들러
  const handleCanvasTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return
    const touch = e.touches[0]
    const current = getNormalizedCoords(touch.clientX, touch.clientY)
    const x = Math.min(dragStart.x, current.x)
    const y = Math.min(dragStart.y, current.y)
    const width = Math.max(0.05, Math.abs(current.x - dragStart.x))
    const height = Math.max(0.05, Math.abs(current.y - dragStart.y))
    setCropBox({ x, y, width, height })
  }

  // 모바일 터치 종료 이벤트 핸들러
  const handleCanvasTouchEnd = () => {
    setIsDragging(false)
  }

  // 크롭 완성 이미지 추출 핸들러
  const handleCropComplete = () => {
    if (!rawImageSrc) return

    const img = new Image()
    img.src = rawImageSrc
    img.onload = () => {
      const offscreenCanvas = document.createElement('canvas')
      const ctx = offscreenCanvas.getContext('2d')

      const srcX = cropBox.x * img.width
      const srcY = cropBox.y * img.height
      const srcW = cropBox.width * img.width
      const srcH = cropBox.height * img.height

      offscreenCanvas.width = srcW
      offscreenCanvas.height = srcH

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)

      offscreenCanvas.toBlob(
        (blob) => {
          if (!blob) return
          const croppedImageFile = new File([blob], 'cropped_pet_skin.jpg', { type: 'image/jpeg' })
          const previewUrl = URL.createObjectURL(blob)

          setCroppedFile(croppedImageFile)
          setCroppedPreviewUrl(previewUrl)
          setIsCropping(false)
        },
        'image/jpeg',
        0.95
      )
    }
  }

  // 1차 스크리닝 진단 제출 이벤트 핸들러
  const handleBinarySubmit = async (e) => {
    e.preventDefault()
    if (!croppedFile) {
      setError('환부 영역을 먼저 선택해 주세요.')
      return
    }

    setLoadingBinary(true)
    setError(null)
    setMultiResult(null)

    const formData = new FormData()
    formData.append('file', croppedFile)

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/skin/diagnosis/binary`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('1차 스크리닝 진단 중 오류가 발생했습니다.')
      const data = await response.json()
      setBinaryResult(data)
    } catch (err) {
      setError(err.message || '서버 통신 오류가 발생했습니다.')
    } finally {
      setLoadingBinary(false)
    }
  }

  // 2차 12종 세부 질환 정밀 진단 제출 이벤트 핸들러
  const handleRequestMultiDiagnosis = async () => {
    if (!croppedFile) return

    setLoadingMulti(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', croppedFile)

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/skin/diagnosis`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('12종 세부 질환 정밀 진단 중 오류가 발생했습니다.')
      const data = await response.json()
      setMultiResult(data)
    } catch (err) {
      setError(err.message || '서버 통신 오류가 발생했습니다.')
    } finally {
      setLoadingMulti(false)
    }
  }

  // 입력 이미지 초기화 이벤트 핸들러
  const handleReset = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    setRawImageSrc(null)
    setCroppedPreviewUrl(null)
    setCroppedFile(null)
    setIsCropping(false)
    setBinaryResult(null)
    setMultiResult(null)
    setError(null)
  }

  // 진단 항목명 파출 헬퍼 함수
  const getItemClassName = (item) => item?.className || item?.class_name || '진단 질환'

  // 진단 신뢰도 산출 헬퍼 함수
  const getItemConfidence = (item) => item?.confidence ?? 0

  // 최고 1차 예측 결과 파생 변수
  const topBinaryPrediction = binaryResult?.topPrediction || binaryResult?.top_prediction

  // 2차 진단 정렬 및 100% 재정규화 파생 상태
  const sortedMultiPredictions = (() => {
    if (!multiResult?.predictions) return []

    const isDiseaseLikely = topBinaryPrediction && getItemClassName(topBinaryPrediction) === '피부 질환 가능성'
    let list = isDiseaseLikely
      ? multiResult.predictions.filter((item) => getItemClassName(item) !== '정상')
      : [...multiResult.predictions]

    list.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))

    if (isDiseaseLikely && list.length > 0) {
      const totalProb = list.reduce((sum, item) => sum + (item.confidence || 0), 0)
      if (totalProb > 0) {
        list = list.map((item) => ({
          ...item,
          confidence: Math.round(((item.confidence || 0) / totalProb) * 10000) / 100,
        }))
      }
    }
    return list
  })()

  // 최고 2차 예측 결과 파생 변수
  const topMultiPrediction = sortedMultiPredictions[0]

  return (
    <div style={mobileContainerStyle}>
      {/* 모바일 전용 상단 헤더 바 */}
      <header style={mobileHeaderStyle}>
        <div style={badgeRowStyle}>
          <span style={mobileHeaderBadgeStyle}>AI 스크리닝 탭</span>
        </div>
        <h1 style={mobileTitleStyle}>{PAGE_TITLE}</h1>
        <p style={mobileSubtitleStyle}>{PAGE_SUBTITLE}</p>
      </header>

      <main style={mobileMainContentStyle}>
        {/* 이미지 업로드 및 크롭 섹션 */}
        <section style={mobileCardStyle}>
          {!isCropping && !croppedPreviewUrl && (
            <div
              style={mobileDropzoneStyle}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div style={mobileUploadPromptStyle}>
                <div style={mobileCameraCircleStyle}>📸</div>
                <p style={mobileUploadTextStyle}>{UPLOAD_PLACEHOLDER}</p>
                <span style={mobileUploadSubTextStyle}>피부 환부 부위가 잘 보이도록 촬영하세요</span>
              </div>
            </div>
          )}

          {/* 환부 영역 터치/마우스 크롭 영역 */}
          {isCropping && rawImageSrc && (
            <div style={mobileCropAreaContainerStyle}>
              <div style={cropInstructionBadgeStyle}>
                👆 환부 영역을 터치하거나 마우스로 드래그하세요
              </div>
              <div style={mobileCanvasWrapperStyle}>
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onTouchStart={handleCanvasTouchStart}
                  onTouchMove={handleCanvasTouchMove}
                  onTouchEnd={handleCanvasTouchEnd}
                  style={mobileCanvasStyle}
                />
              </div>
              <div style={mobileButtonGroupStyle}>
                <button type="button" onClick={handleReset} style={mobileSecondaryButtonStyle}>
                  다시 선택
                </button>
                <button type="button" onClick={handleCropComplete} style={mobilePrimaryButtonStyle}>
                  ✂️ 환부 크롭 완료
                </button>
              </div>
            </div>
          )}

          {/* 환부 이미지 미리보기 및 진단 요청 버튼 */}
          {!isCropping && croppedPreviewUrl && (
            <form onSubmit={handleBinarySubmit}>
              <div style={mobilePreviewWrapperStyle}>
                <span style={mobileCropNoticeBadgeStyle}>선택된 환부 이미지</span>
                <img src={croppedPreviewUrl} alt="환부 크롭 미리보기" style={mobilePreviewImageStyle} />
              </div>

              {error && <div style={mobileErrorMessageStyle}>{error}</div>}

              <div style={mobileButtonGroupVerticalStyle}>
                <button type="submit" style={mobilePrimaryFullButtonStyle} disabled={loadingBinary || loadingMulti}>
                  {loadingBinary ? '⏳ 1차 스크리닝 분석 중...' : '⚡ 피부 질환 1차 스크리닝 시작'}
                </button>
                <div style={mobileButtonGroupStyle}>
                  <button
                    type="button"
                    onClick={() => setIsCropping(true)}
                    style={mobileSecondaryButtonStyle}
                    disabled={loadingBinary || loadingMulti}
                  >
                    영역 재지정
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    style={mobileSecondaryButtonStyle}
                    disabled={loadingBinary || loadingMulti}
                  >
                    새 사진
                  </button>
                </div>
              </div>
            </form>
          )}

          {error && !croppedPreviewUrl && <div style={mobileErrorMessageStyle}>{error}</div>}
        </section>

        {/* 1차 스크리닝 결과 카드 */}
        {binaryResult && binaryResult.success && (
          <section style={mobileResultCardStyle}>
            <h2 style={mobileResultHeadingStyle}>⚡ 1차 스크리닝 진단 결과</h2>

            {topBinaryPrediction && (
              <div
                style={{
                  ...mobileTopPredictionCardStyle,
                  backgroundColor: getItemClassName(topBinaryPrediction) === '정상' ? '#ECFDF5' : '#FEF2F2',
                  borderColor: getItemClassName(topBinaryPrediction) === '정상' ? '#A7F3D0' : '#FECACA',
                }}
              >
                <span
                  style={{
                    ...mobileTopBadgeStyle,
                    backgroundColor: getItemClassName(topBinaryPrediction) === '정상' ? '#059669' : '#DC2626',
                  }}
                >
                  스크리닝 소견
                </span>
                <h3
                  style={{
                    ...mobileTopDiseaseNameStyle,
                    color: getItemClassName(topBinaryPrediction) === '정상' ? '#065F46' : '#991B1B',
                  }}
                >
                  {getItemClassName(topBinaryPrediction)}
                </h3>
                <div
                  style={{
                    ...mobileTopConfidenceStyle,
                    color: getItemClassName(topBinaryPrediction) === '정상' ? '#047857' : '#B91C1C',
                  }}
                >
                  신뢰도 <strong>{getItemConfidence(topBinaryPrediction)}%</strong>
                </div>
              </div>
            )}

            {/* 2차 정밀 연계 진단 버튼 */}
            <div style={mobileSecondaryActionContainerStyle}>
              <p style={mobileSecondaryActionNoticeStyle}>
                💡 세부 질환 12종 중 어디에 해당하는지 정밀 분석을 원하시나요?
              </p>
              <button
                type="button"
                onClick={handleRequestMultiDiagnosis}
                style={mobileMultiDiagnosisButtonStyle}
                disabled={loadingMulti}
              >
                {loadingMulti ? '분석 중...' : '🔍 12종 세부 질환 정밀 AI 분석 받기'}
              </button>
            </div>
          </section>
        )}

        {/* 2차 세부 정밀 진단 결과 카드 */}
        {multiResult && multiResult.success && (
          <section style={mobileResultCardStyle}>
            <h2 style={mobileResultHeadingStyle}>🩺 12종 세부 질환 정밀 분석</h2>

            {topMultiPrediction && (
              <div style={mobileTopPredictionCardStyle}>
                <span style={mobileTopBadgeStyle}>최고 의심 질환</span>
                <h3 style={mobileTopDiseaseNameStyle}>{getItemClassName(topMultiPrediction)}</h3>
                <div style={mobileTopConfidenceStyle}>
                  상대 신뢰도 <strong>{getItemConfidence(topMultiPrediction)}%</strong>
                </div>
              </div>
            )}

            <h4 style={mobileSubHeadingStyle}>질환별 상대 확률 분포</h4>
            <div style={mobileProgressListStyle}>
              {sortedMultiPredictions.map((item, index) => (
                <div key={item.classIndex ?? item.class_index ?? index} style={mobileProgressItemStyle}>
                  <div style={mobileLabelRowStyle}>
                    <span style={mobileDiseaseLabelStyle}>
                      {index + 1}. {getItemClassName(item)}
                    </span>
                    <span style={mobileConfidenceTextStyle}>{getItemConfidence(item)}%</span>
                  </div>
                  <div style={mobileProgressBarTrackStyle}>
                    <div
                      style={{
                        ...mobileProgressBarFillStyle,
                        width: `${Math.min(getItemConfidence(item), 100)}%`,
                        backgroundColor: index === 0 ? '#6366F1' : '#CBD5E1',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 수의사 진료 안내 주의 배너 */}
            <div style={mobileDisclaimerCardStyle}>
              <div style={mobileDisclaimerHeaderStyle}>
                <span style={{ fontSize: '18px' }}>🩺</span>
                <h4 style={mobileDisclaimerTitleStyle}>수의사 진료 안내</h4>
              </div>
              <p style={mobileDisclaimerTextStyle}>
                본 진단은 AI 스크리닝 보조 도구입니다. 가려움이나 병변이 심해지면 반드시 <strong>가까운 동물병원 수의사</strong>의 정밀 진료를 받으세요.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// 모바일 퍼스트 전용 스타일 객체 정의
const mobileContainerStyle = {
  maxWidth: '480px',
  margin: '0 auto',
  minHeight: '100vh',
  padding: '16px 12px 32px 12px',
  boxSizing: 'border-box',
  fontFamily: "'Pretendard', system-ui, -apple-system, sans-serif",
  backgroundColor: '#F8FAFC',
  color: '#0F172A',
}

const mobileHeaderStyle = {
  textAlign: 'center',
  marginBottom: '20px',
}

const badgeRowStyle = {
  display: 'flex',
  justifyContent: 'center',
  marginBottom: '6px',
}

const mobileHeaderBadgeStyle = {
  fontSize: '12px',
  fontWeight: '700',
  color: '#4F46E5',
  backgroundColor: '#EEF2FF',
  padding: '3px 10px',
  borderRadius: '12px',
}

const mobileTitleStyle = {
  fontSize: '22px',
  fontWeight: '800',
  color: '#0F172A',
  margin: '0 0 6px 0',
  letterSpacing: '-0.5px',
}

const mobileSubtitleStyle = {
  fontSize: '13px',
  color: '#64748B',
  margin: 0,
  lineHeight: 1.4,
}

const mobileMainContentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const mobileCardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '20px',
  padding: '20px 16px',
  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
  border: '1px solid #F1F5F9',
}

const mobileDropzoneStyle = {
  border: '2px dashed #CBD5E1',
  borderRadius: '16px',
  padding: '32px 16px',
  textAlign: 'center',
  cursor: 'pointer',
  backgroundColor: '#F8FAFC',
  transition: 'all 0.2s ease',
}

const mobileUploadPromptStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const mobileCameraCircleStyle = {
  width: '56px',
  height: '56px',
  borderRadius: '28px',
  backgroundColor: '#EEF2FF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '28px',
  marginBottom: '12px',
}

const mobileUploadTextStyle = {
  fontSize: '15px',
  fontWeight: '700',
  color: '#1E293B',
  margin: '0 0 4px 0',
}

const mobileUploadSubTextStyle = {
  fontSize: '12px',
  color: '#94A3B8',
}

const mobileCropAreaContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
}

const cropInstructionBadgeStyle = {
  fontSize: '13px',
  fontWeight: '700',
  color: '#4F46E5',
  backgroundColor: '#EEF2FF',
  padding: '6px 12px',
  borderRadius: '20px',
}

const mobileCanvasWrapperStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  border: '1px solid #E2E8F0',
  borderRadius: '16px',
  overflow: 'hidden',
  backgroundColor: '#000000',
}

const mobileCanvasStyle = {
  maxWidth: '100%',
  height: 'auto',
  display: 'block',
  touchAction: 'none',
}

const mobileCropNoticeBadgeStyle = {
  fontSize: '12px',
  fontWeight: '700',
  color: '#4F46E5',
  backgroundColor: '#EEF2FF',
  padding: '4px 10px',
  borderRadius: '10px',
  marginBottom: '8px',
}

const mobilePreviewWrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  marginBottom: '16px',
}

const mobilePreviewImageStyle = {
  maxHeight: '240px',
  maxWidth: '100%',
  borderRadius: '14px',
  objectFit: 'contain',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
}

const mobileErrorMessageStyle = {
  marginTop: '12px',
  padding: '10px 14px',
  backgroundColor: '#FEF2F2',
  color: '#EF4444',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '600',
}

const mobileButtonGroupStyle = {
  display: 'flex',
  gap: '10px',
  width: '100%',
}

const mobileButtonGroupVerticalStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
}

const mobilePrimaryButtonStyle = {
  flex: 1,
  minHeight: '48px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '14px',
  fontSize: '15px',
  fontWeight: '700',
  cursor: 'pointer',
}

const mobilePrimaryFullButtonStyle = {
  width: '100%',
  minHeight: '50px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '14px',
  fontSize: '16px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
}

const mobileSecondaryButtonStyle = {
  flex: 1,
  minHeight: '46px',
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: 'none',
  borderRadius: '14px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
}

const mobileResultCardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '20px',
  padding: '20px 16px',
  boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
  border: '1px solid #F1F5F9',
}

const mobileResultHeadingStyle = {
  fontSize: '18px',
  fontWeight: '800',
  color: '#0F172A',
  marginBottom: '16px',
}

const mobileTopPredictionCardStyle = {
  borderRadius: '16px',
  padding: '16px',
  textAlign: 'center',
  marginBottom: '16px',
  border: '1px solid',
}

const mobileTopBadgeStyle = {
  display: 'inline-block',
  padding: '4px 10px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: '700',
  marginBottom: '6px',
}

const mobileTopDiseaseNameStyle = {
  fontSize: '22px',
  fontWeight: '800',
  margin: '4px 0',
}

const mobileTopConfidenceStyle = {
  fontSize: '14px',
}

const mobileSecondaryActionContainerStyle = {
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: '1px dashed #E2E8F0',
}

const mobileSecondaryActionNoticeStyle = {
  fontSize: '13px',
  color: '#475569',
  marginBottom: '10px',
  lineHeight: 1.4,
}

const mobileMultiDiagnosisButtonStyle = {
  width: '100%',
  minHeight: '48px',
  backgroundColor: '#1E1B4B',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '14px',
  fontSize: '15px',
  fontWeight: '700',
  cursor: 'pointer',
}

const mobileSubHeadingStyle = {
  fontSize: '14px',
  fontWeight: '700',
  color: '#334155',
  marginBottom: '12px',
}

const mobileProgressListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const mobileProgressItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const mobileLabelRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '13px',
}

const mobileDiseaseLabelStyle = {
  fontWeight: '600',
  color: '#1E293B',
}

const mobileConfidenceTextStyle = {
  fontWeight: '700',
  color: '#475569',
}

const mobileProgressBarTrackStyle = {
  height: '8px',
  backgroundColor: '#F1F5F9',
  borderRadius: '4px',
  overflow: 'hidden',
}

const mobileProgressBarFillStyle = {
  height: '100%',
  borderRadius: '4px',
  transition: 'width 0.4s ease',
}

const mobileDisclaimerCardStyle = {
  marginTop: '20px',
  padding: '14px',
  backgroundColor: '#FFFBEB',
  border: '1px solid #FCD34D',
  borderRadius: '14px',
}

const mobileDisclaimerHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '6px',
}

const mobileDisclaimerTitleStyle = {
  fontSize: '14px',
  fontWeight: '700',
  color: '#92400E',
  margin: 0,
}

const mobileDisclaimerTextStyle = {
  fontSize: '12px',
  color: '#B45309',
  margin: 0,
  lineHeight: 1.5,
}
