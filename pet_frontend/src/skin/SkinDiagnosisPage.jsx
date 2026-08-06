import React, { useState, useRef } from 'react'
import { BACKEND_URL } from '../config'

// 고정 안내 문구 및 가이드 텍스트 상수는 외부 선언하여 useState 최소화
const PAGE_TITLE = '강아지 피부병 12종 AI 진단 서비스'
const PAGE_SUBTITLE = '강아지의 피부 사진을 업로드하시면 EfficientNet-B0 AI 모델이 12가지 피부 질환 확률을 분석해 드립니다.'
const UPLOAD_PLACEHOLDER = '클릭하거나 피부 사진을 드래그하여 업로드하세요.'

export default function SkinDiagnosisPage() {
  // 비제어 컴포넌트를 위한 파일 인풋 참조 객체
  const fileInputRef = useRef(null)

  // 화면 UI 변경을 위한 최소 상태 (미리보기 URL, 로딩 상태, 분석 결과)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // 파일 선택 및 이미지 미리보기 URL 생성 처리 이벤트 핸들러
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.')
      return
    }

    setError(null)
    setResult(null)
    setPreviewUrl(URL.createObjectURL(file))
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

  // Spring Boot 백엔드 API로 이미지 파일 제출 및 진단 요청 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('진단할 강아지 피부 사진을 먼저 선택해 주세요.')
      return
    }

    setLoading(true)
    setError(null)

    // 비제어 FormData 객체를 활용한 파일 데이터 구성
    const formData = new FormData()
    formData.append('file', file)

    try {
      // 환경변수 기반 백엔드 API 호출
      const response = await fetch(`${BACKEND_URL}/api/v1/skin/diagnosis`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('피부병 AI 진단 서버 처리 중 오류가 발생했습니다.')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message || '서버 통신 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 초기화 버튼 이벤트 핸들러
  const handleReset = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPreviewUrl(null)
    setResult(null)
    setError(null)
  }

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>{PAGE_TITLE}</h1>
        <p style={subtitleStyle}>{PAGE_SUBTITLE}</p>
      </header>

      <main style={mainContentStyle}>
        {/* 사진 업로드 및 미리보기 카드 영역 */}
        <section style={cardStyle}>
          <form onSubmit={handleSubmit}>
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

              {previewUrl ? (
                <div style={previewWrapperStyle}>
                  <img src={previewUrl} alt="피부 사진 미리보기" style={previewImageStyle} />
                  <p style={changeTextNoticeStyle}>이미지를 다시 클릭하거나 드래그하면 변경됩니다.</p>
                </div>
              ) : (
                <div style={uploadPromptStyle}>
                  <div style={iconStyle}>📸</div>
                  <p style={uploadTextStyle}>{UPLOAD_PLACEHOLDER}</p>
                  <span style={uploadSubTextStyle}>PNG, JPG, JPEG 지원</span>
                </div>
              )}
            </div>

            {error && <div style={errorMessageStyle}>{error}</div>}

            <div style={buttonGroupStyle}>
              {previewUrl && (
                <button type="button" onClick={handleReset} style={secondaryButtonStyle} disabled={loading}>
                  다시 선택
                </button>
              )}
              <button type="submit" style={primaryButtonStyle} disabled={loading || !previewUrl}>
                {loading ? 'AI 피부 분석 중...' : '피부병 AI 진단하기'}
              </button>
            </div>
          </form>
        </section>

        {/* AI 분석 결과 시각화 카드 영역 */}
        {result && result.success && (
          <section style={resultCardStyle}>
            <h2 style={resultHeadingStyle}>🩺 AI 피부병 분석 결과</h2>

            {/* 최고 신뢰도 피부병 결과 강조 하이라이트 */}
            {result.topPrediction && (
              <div style={topPredictionCardStyle}>
                <span style={topBadgeStyle}>최고 확률 진단</span>
                <h3 style={topDiseaseNameStyle}>{result.topPrediction.className}</h3>
                <div style={topConfidenceStyle}>
                  신뢰도 <strong>{result.topPrediction.confidence}%</strong>
                </div>
              </div>
            )}

            {/* 12종 전체 피부 질환 분석 확률 프로그래스바 목록 */}
            <h4 style={subHeadingStyle}>12개 전체 피부 질환별 분석 확률</h4>
            <div style={progressListStyle}>
              {result.predictions?.map((item, index) => (
                <div key={item.classIndex || index} style={progressItemStyle}>
                  <div style={labelRowStyle}>
                    <span style={diseaseLabelStyle}>{item.className}</span>
                    <span style={confidenceTextStyle}>{item.confidence}%</span>
                  </div>
                  <div style={progressBarTrackStyle}>
                    <div
                      style={{
                        ...progressBarFillStyle,
                        width: `${Math.min(item.confidence, 100)}%`,
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

// 인라인 스타일 객체 정의 (디자인 및 다크/라이트 파스텔 테마)
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

const changeTextNoticeStyle = {
  fontSize: '13px',
  color: '#6B7280',
  margin: 0,
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
  marginBottom: '24px',
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
  fontWeight: '500',
  color: '#374151',
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
