import React, { useState, useRef, useEffect } from 'react'
import { BACKEND_URL } from '../config'

// 고정 가이드 텍스트 상수는 외부 선언하여 useState 최소화
const PAGE_TITLE = '강아지 피부 질환 1차 스크리닝 & 정밀 AI 진단'
const PAGE_SUBTITLE = '피부 사진을 업로드하신 후 환부 영역을 지정하시면 1차 스크리닝(정상 유무)과 12종 세부 질환 정밀 분석을 연계하여 제공해 드립니다.'
const UPLOAD_PLACEHOLDER = '클릭하거나 피부 사진을 드래그하여 업로드하세요.'

export default function SkinDiagnosisPage() {
  // 비제어 컴포넌트를 위한 참조 객체
  const fileInputRef = useRef(null)
  const canvasRef = useRef(null)

  // 화면 UI 상태
  const [rawImageSrc, setRawImageSrc] = useState(null)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null)
  const [croppedFile, setCroppedFile] = useState(null)
  
  // 1차 스크리닝 결과 및 2차 세부 진단 결과 상태
  const [binaryResult, setBinaryResult] = useState(null)
  const [multiResult, setMultiResult] = useState(null)

  const [loadingBinary, setLoadingBinary] = useState(false)
  const [loadingMulti, setLoadingMulti] = useState(false)
  const [error, setError] = useState(null)
  const [isCropping, setIsCropping] = useState(false)

  // 캔버스 환부 크롭 선택 박스 상태
  const [cropBox, setCropBox] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 이미지 파일 선택 이벤트 핸들러
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

  // 드래그 앤 드롭 파일 놓기 이벤트 핸들러
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

  // Drag Over 방지 이벤트 핸들러
  const handleDragOver = (e) => {
    e.preventDefault()
  }

  // 캔버스 환부 가이드 라인 렌더링 효과
  useEffect(() => {
    if (!rawImageSrc || !canvasRef.current || !isCropping) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.src = rawImageSrc

    img.onload = () => {
      const maxWidth = 600
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const cropX = cropBox.x * canvas.width
      const cropY = cropBox.y * canvas.height
      const cropW = cropBox.width * canvas.width
      const cropH = cropBox.height * canvas.height

      ctx.clearRect(cropX, cropY, cropW, cropH)
      ctx.drawImage(
        img,
        (cropBox.x * img.width), (cropBox.y * img.height),
        (cropBox.width * img.width), (cropBox.height * img.height),
        cropX, cropY, cropW, cropH
      )

      ctx.strokeStyle = '#4F46E5'
      ctx.lineWidth = 3
      ctx.strokeRect(cropX, cropY, cropW, cropH)
    }
  }, [rawImageSrc, cropBox, isCropping])

  // 캔버스 마우스 다운 이벤트 핸들러
  const handleCanvasMouseDown = (e) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / rect.width
    const mouseY = (e.clientY - rect.top) / rect.height

    setIsDragging(true)
    setDragStart({ x: mouseX, y: mouseY })
    setCropBox({ x: mouseX, y: mouseY, width: 0.05, height: 0.05 })
  }

  // 캔버스 마우스 이동 이벤트 핸들러
  const handleCanvasMouseMove = (e) => {
    if (!isDragging || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const currentX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const currentY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

    const x = Math.min(dragStart.x, currentX)
    const y = Math.min(dragStart.y, currentY)
    const width = Math.max(0.05, Math.abs(currentX - dragStart.x))
    const height = Math.max(0.05, Math.abs(currentY - dragStart.y))

    setCropBox({ x, y, width, height })
  }

  // 캔버스 마우스 업 이벤트 핸들러
  const handleCanvasMouseUp = () => {
    setIsDragging(false)
  }

  // 환부 크롭 선택 완료 이벤트 핸들러
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

      offscreenCanvas.toBlob((blob) => {
        if (!blob) return
        const croppedImageFile = new File([blob], 'cropped_pet_skin.jpg', { type: 'image/jpeg' })
        const previewUrl = URL.createObjectURL(blob)

        setCroppedFile(croppedImageFile)
        setCroppedPreviewUrl(previewUrl)
        setIsCropping(false)
      }, 'image/jpeg', 0.95)
    }
  }

  // 1차 스크리닝 진단 제출 핸들러 (POST /api/v1/skin/diagnosis/binary)
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

  // 1차 진단 후 동일 환부 사진으로 2차 12종 세부 질환 연속 진단 요청 핸들러 (POST /api/v1/skin/diagnosis)
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

  // 초기화 핸들러
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

  // 파생 상태 (Derived State): 12종 세부 결과 내림차순 정렬
  const sortedMultiPredictions = multiResult?.predictions
    ? [...multiResult.predictions].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    : []

  const topBinaryPrediction = binaryResult?.topPrediction || binaryResult?.top_prediction
  const topMultiPrediction = sortedMultiPredictions[0] || multiResult?.topPrediction || multiResult?.top_prediction

  const getItemClassName = (item) => item?.className || item?.class_name || '진단 질환'
  const getItemConfidence = (item) => item?.confidence ?? 0

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>{PAGE_TITLE}</h1>
        <p style={subtitleStyle}>{PAGE_SUBTITLE}</p>
      </header>

      <main style={mainContentStyle}>
        {/* 사진 업로드 및 크롭 카드 영역 */}
        <section style={cardStyle}>
          {!isCropping && !croppedPreviewUrl && (
            <div
              style={dropzoneStyle}
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
              <div style={uploadPromptStyle}>
                <div style={iconStyle}>📸</div>
                <p style={uploadTextStyle}>{UPLOAD_PLACEHOLDER}</p>
                <span style={uploadSubTextStyle}>PNG, JPG, JPEG 지원</span>
              </div>
            </div>
          )}

          {/* 환부 영역 자유 드래그 크롭 화면 */}
          {isCropping && rawImageSrc && (
            <div style={cropAreaContainerStyle}>
              <h3 style={cropInstructionTitleStyle}>🔍 아픈 환부 부위를 마우스로 드래그하여 지정하세요</h3>
              <div style={canvasWrapperStyle}>
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  style={canvasStyle}
                />
              </div>
              <div style={buttonGroupStyle}>
                <button type="button" onClick={handleReset} style={secondaryButtonStyle}>
                  다시 선택
                </button>
                <button type="button" onClick={handleCropComplete} style={primaryButtonStyle}>
                  ✂️ 환부 선택 완료
                </button>
              </div>
            </div>
          )}

          {/* 환부 크롭 완료 후 미리보기 및 1차 스크리닝 진단 제출 영역 */}
          {!isCropping && croppedPreviewUrl && (
            <form onSubmit={handleBinarySubmit}>
              <div style={previewWrapperStyle}>
                <span style={cropBadgeNoticeStyle}>잘라낸 환부 이미지</span>
                <img src={croppedPreviewUrl} alt="환부 크롭 미리보기" style={previewImageStyle} />
              </div>

              {error && <div style={errorMessageStyle}>{error}</div>}

              <div style={buttonGroupStyle}>
                <button type="button" onClick={() => setIsCropping(true)} style={secondaryButtonStyle} disabled={loadingBinary || loadingMulti}>
                  환부 재지정
                </button>
                <button type="button" onClick={handleReset} style={secondaryButtonStyle} disabled={loadingBinary || loadingMulti}>
                  새 이미지
                </button>
                <button type="submit" style={primaryButtonStyle} disabled={loadingBinary || loadingMulti}>
                  {loadingBinary ? '1차 스크리닝 분석 중...' : '⚡ 피부 질환 1차 스크리닝 진단하기'}
                </button>
              </div>
            </form>
          )}

          {error && !croppedPreviewUrl && <div style={errorMessageStyle}>{error}</div>}
        </section>

        {/* 1차 스크리닝 AI 진단 결과 카드 영역 */}
        {binaryResult && binaryResult.success && (
          <section style={resultCardStyle}>
            <h2 style={resultHeadingStyle}>⚡ 피부 질환 가능성 1차 스크리닝 결과</h2>

            {topBinaryPrediction && (
              <div style={{
                ...topPredictionCardStyle,
                backgroundColor: getItemClassName(topBinaryPrediction) === '정상' ? '#ECFDF5' : '#FEF2F2',
                borderColor: getItemClassName(topBinaryPrediction) === '정상' ? '#A7F3D0' : '#FECACA',
              }}>
                <span style={{
                  ...topBadgeStyle,
                  backgroundColor: getItemClassName(topBinaryPrediction) === '정상' ? '#059669' : '#DC2626',
                }}>
                  1차 진단 결과
                </span>
                <h3 style={{
                  ...topDiseaseNameStyle,
                  color: getItemClassName(topBinaryPrediction) === '정상' ? '#065F46' : '#991B1B',
                }}>
                  {getItemClassName(topBinaryPrediction)}
                </h3>
                <div style={{
                  ...topConfidenceStyle,
                  color: getItemClassName(topBinaryPrediction) === '정상' ? '#047857' : '#B91C1C',
                }}>
                  신뢰도 <strong>{getItemConfidence(topBinaryPrediction)}%</strong>
                </div>
              </div>
            )}

            {/* 1차 진단 결과 하단에 2차 12종 세부 질환 정밀 진단 연계 버튼 탑재 */}
            <div style={secondaryActionContainerStyle}>
              <p style={secondaryActionNoticeStyle}>
                💡 1차 스크리닝이 완료되었습니다. 아픈 피부의 12종 세부 질환 정밀 분석이 필요하신가요?
              </p>
              <button
                type="button"
                onClick={handleRequestMultiDiagnosis}
                style={multiDiagnosisButtonStyle}
                disabled={loadingMulti}
              >
                {loadingMulti ? '12종 정밀 분석 중...' : '🔍 12종 세부 질환 정밀 AI 진단받기'}
              </button>
            </div>
          </section>
        )}

        {/* 2차 12종 세부 피부 질환 정밀 AI 분석 결과 카드 영역 */}
        {multiResult && multiResult.success && (
          <section style={resultCardStyle}>
            <h2 style={resultHeadingStyle}>🩺 12종 세부 피부 질환 정밀 AI 분석 결과</h2>

            {topMultiPrediction && (
              <div style={topPredictionCardStyle}>
                <span style={topBadgeStyle}>최고 확률 정밀 진단</span>
                <h3 style={topDiseaseNameStyle}>{getItemClassName(topMultiPrediction)}</h3>
                <div style={topConfidenceStyle}>
                  신뢰도 <strong>{getItemConfidence(topMultiPrediction)}%</strong>
                </div>
              </div>
            )}

            <h4 style={subHeadingStyle}>12개 세부 질환별 분석 확률 (높은 순)</h4>
            <div style={progressListStyle}>
              {sortedMultiPredictions.map((item, index) => (
                <div key={item.classIndex ?? item.class_index ?? index} style={progressItemStyle}>
                  <div style={labelRowStyle}>
                    <span style={diseaseLabelStyle}>
                      {index + 1}. {getItemClassName(item)}
                    </span>
                    <span style={confidenceTextStyle}>{getItemConfidence(item)}%</span>
                  </div>
                  <div style={progressBarTrackStyle}>
                    <div
                      style={{
                        ...progressBarFillStyle,
                        width: `${Math.min(getItemConfidence(item), 100)}%`,
                        backgroundColor: index === 0 ? '#4F46E5' : '#9CA3AF',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

// 인라인 스타일 객체 정의
const containerStyle = {
  maxWidth: '900px',
  margin: '0 auto',
  padding: '40px 20px',
  fontFamily: "'Pretendard', system-ui, -apple-system, sans-serif",
  color: '#1F2937',
}

const headerStyle = {
  textAlign: 'center',
  marginBottom: '32px',
}

const titleStyle = {
  fontSize: '28px',
  fontWeight: '700',
  color: '#111827',
  marginBottom: '12px',
}

const subtitleStyle = {
  fontSize: '15px',
  color: '#6B7280',
  margin: 0,
}

const mainContentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
  border: '1px solid #F3F4F6',
}

const dropzoneStyle = {
  border: '2px dashed #E5E7EB',
  borderRadius: '12px',
  padding: '40px 20px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'border-color 0.2s ease',
  backgroundColor: '#FAFAFA',
}

const uploadPromptStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const iconStyle = {
  fontSize: '48px',
  marginBottom: '12px',
}

const uploadTextStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#374151',
  marginBottom: '4px',
}

const uploadSubTextStyle = {
  fontSize: '13px',
  color: '#9CA3AF',
}

const cropAreaContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
}

const cropInstructionTitleStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#4F46E5',
  margin: 0,
}

const canvasWrapperStyle = {
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
}

const canvasStyle = {
  display: 'block',
  cursor: 'crosshair',
}

const cropBadgeNoticeStyle = {
  fontSize: '12px',
  fontWeight: '600',
  color: '#4F46E5',
  backgroundColor: '#EEF2FF',
  padding: '4px 10px',
  borderRadius: '12px',
  marginBottom: '8px',
}

const previewWrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const previewImageStyle = {
  maxHeight: '300px',
  maxWidth: '100%',
  borderRadius: '12px',
  objectFit: 'contain',
  marginBottom: '12px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
}

const errorMessageStyle = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: '#FEE2E2',
  color: '#DC2626',
  borderRadius: '8px',
  fontSize: '14px',
}

const buttonGroupStyle = {
  display: 'flex',
  gap: '12px',
  marginTop: '24px',
  width: '100%',
}

const primaryButtonStyle = {
  flex: 1,
  padding: '14px 20px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '10px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease',
}

const secondaryButtonStyle = {
  padding: '14px 20px',
  backgroundColor: '#F3F4F6',
  color: '#374151',
  border: 'none',
  borderRadius: '10px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: 'pointer',
}

const resultCardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  padding: '32px',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
  border: '1px solid #F3F4F6',
}

const resultHeadingStyle = {
  fontSize: '20px',
  fontWeight: '700',
  color: '#111827',
  marginBottom: '20px',
}

const topPredictionCardStyle = {
  backgroundColor: '#EEF2FF',
  border: '1px solid #C7D2FE',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '20px',
  textAlign: 'center',
}

const topBadgeStyle = {
  display: 'inline-block',
  padding: '4px 12px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: '600',
  marginBottom: '8px',
}

const topDiseaseNameStyle = {
  fontSize: '26px',
  fontWeight: '800',
  color: '#312E81',
  margin: '8px 0',
}

const topConfidenceStyle = {
  fontSize: '16px',
  color: '#4338CA',
}

const secondaryActionContainerStyle = {
  marginTop: '20px',
  paddingTop: '20px',
  borderTop: '1px dashed #E5E7EB',
  textAlign: 'center',
}

const secondaryActionNoticeStyle = {
  fontSize: '14px',
  color: '#4B5563',
  marginBottom: '14px',
}

const multiDiagnosisButtonStyle = {
  width: '100%',
  padding: '16px 24px',
  backgroundColor: '#312E81',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '12px',
  fontSize: '16px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(49, 46, 129, 0.2)',
  transition: 'transform 0.1s ease',
}

const subHeadingStyle = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#374151',
  marginBottom: '16px',
}

const progressListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const progressItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const labelRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '14px',
}

const diseaseLabelStyle = {
  fontWeight: '600',
  color: '#1F2937',
}

const confidenceTextStyle = {
  fontWeight: '600',
  color: '#4B5563',
}

const progressBarTrackStyle = {
  height: '10px',
  backgroundColor: '#E5E7EB',
  borderRadius: '5px',
  overflow: 'hidden',
}

const progressBarFillStyle = {
  height: '100%',
  borderRadius: '5px',
  transition: 'width 0.5s ease-in-out',
}
