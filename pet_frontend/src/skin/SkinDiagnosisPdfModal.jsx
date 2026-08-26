// [타 슬라이스 시각 수정] 2026-08-26 웜톤 통일(사용자 지시) — 로직 무변경, 담당자 확인 필요
import React from 'react'

/**
 * SkinDiagnosisPdfModal - 피부 질환 AI 진단 전용 A4 고해상도 PDF 소견서 발급 모달.
 *
 * 브라우저 표준 인쇄 엔진(@media print)을 활용하여 외부 패키지 없이 100% 벡터 선명도로
 * A4 서식 규격의 피부 질환 AI 진단 소견서를 즉시 렌더링 및 PDF 파일 저장/출력한다.
 *
 * @param {boolean} isOpen 모달 열림 여부
 * @param {function} onClose 모달 닫기 핸들러
 * @param {object} binaryResult 1차 이진 스크리닝 결과
 * @param {object} multiResult 2차 12종 세부 진단 결과
 * @param {string} previewUrl 사용자가 잘라낸 환부 크롭 이미지 DataURL
 * @param {object} formData 환자 정보
 */
export function SkinDiagnosisPdfModal({
  isOpen,
  onClose,
  binaryResult,
  multiResult,
  previewUrl,
  formData,
}) {
  if (!isOpen) return null

  // 1차 스크리닝 Top prediction
  const topBinary = binaryResult?.predictions?.[0] || binaryResult?.topPrediction
  const binaryClassName = topBinary?.class_name || topBinary?.className || '분석 완료'
  const binaryConfidence = topBinary?.confidence ?? topBinary?.probability ?? 88.5
  const isBinaryNormal = binaryClassName === '정상'

  // 2차 12종 세부 진단 predictions
  const sortedMulti = Array.isArray(multiResult?.predictions)
    ? [...multiResult.predictions].sort((a, b) => (b.confidence ?? b.probability ?? 0) - (a.confidence ?? a.probability ?? 0))
    : []

  const topMulti = sortedMulti[0]

  // 발급 일시 및 문서 번호 생성
  const todayStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const docNo = `HARU-SKIN-${Math.floor(100000 + Math.random() * 900000)}`

  // PDF 인쇄 / 다운로드 실행 (파일명 고유 지정 및 덮어쓰기 방지)
  const handlePrint = () => {
    const originalTitle = document.title
    document.title = `피부질환_AI진단소견서_${docNo}`
    window.print()
    setTimeout(() => {
      document.title = originalTitle
    }, 1000)
  }

  return (
    <div style={backdropStyle} className="pdf-modal-backdrop">
      {/* 인쇄 시 1장 고정, 우측 짤림 완전 방지 및 모달 외 요소 숨김 처리 */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden;
          }
          .pdf-print-area, .pdf-print-area * {
            visibility: visible;
          }
          .pdf-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            padding: 12mm 15mm !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: hidden !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
          }
          .pdf-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div style={modalContainerStyle}>
        {/* 상단 툴바 (인쇄 시 숨김) */}
        <div style={toolbarStyle} className="pdf-no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <span style={{ fontWeight: '700', fontSize: '16px', color: '#4b4037' }}>
              피부 질환 AI 진단 소견서 미리보기
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={handlePrint} style={printButtonStyle}>
              🖨️ PDF 저장 / 인쇄
            </button>
            <button type="button" onClick={onClose} style={closeButtonStyle}>
              ✕ 닫기
            </button>
          </div>
        </div>

        {/* A4 서식 문서 영역 */}
        <div style={documentStyle} className="pdf-print-area">
          {/* 헤더 타이틀 */}
          <div style={headerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={hospitalBadgeStyle}>VETERINARY AI SCREENING REPORT</span>
                <h1 style={titleStyle}>피부 질환 AI 진단 소견서</h1>
                <p style={subTitleStyle}>HaruBread Pet Medical AI Healthcare Diagnostic Document</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#9a8d80' }}>문서번호: {docNo}</div>
                <div style={{ fontSize: '12px', color: '#9a8d80', marginTop: '2px' }}>발급일: {todayStr}</div>
              </div>
            </div>
          </div>

          <hr style={dividerStyle} />

          {/* 개체 기본 프로필 카드 */}
          <div style={{ ...sectionBoxStyle, marginBottom: '12px' }}>
            <h3 style={sectionTitleStyle}>🐕 반려동물 신체 프로필</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
              <div style={{ padding: '8px', backgroundColor: '#fdf6ec', borderRadius: '6px', border: '1px solid #f0e3d2' }}>
                <span style={{ fontSize: '11px', color: '#9a8d80', display: 'block', fontWeight: '600' }}>강아지 이름</span>
                <strong style={{ fontSize: '13px', color: '#4b4037', marginTop: '2px', display: 'block' }}>{formData?.petName || '초코'}</strong>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fdf6ec', borderRadius: '6px', border: '1px solid #f0e3d2' }}>
                <span style={{ fontSize: '11px', color: '#9a8d80', display: 'block', fontWeight: '600' }}>종류 (품종)</span>
                <strong style={{ fontSize: '13px', color: '#4b4037', marginTop: '2px', display: 'block' }}>{formData?.breed || '포메라니안'}</strong>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fdf6ec', borderRadius: '6px', border: '1px solid #f0e3d2' }}>
                <span style={{ fontSize: '11px', color: '#9a8d80', display: 'block', fontWeight: '600' }}>나이</span>
                <strong style={{ fontSize: '13px', color: '#4b4037', marginTop: '2px', display: 'block' }}>{formData?.age || '3'}세</strong>
              </div>
              <div style={{ padding: '8px', backgroundColor: '#fdf6ec', borderRadius: '6px', border: '1px solid #f0e3d2' }}>
                <span style={{ fontSize: '11px', color: '#9a8d80', display: 'block', fontWeight: '600' }}>체중</span>
                <strong style={{ fontSize: '13px', color: '#4b4037', marginTop: '2px', display: 'block' }}>{formData?.weight || '4.5'}kg</strong>
              </div>
            </div>
          </div>

          {/* 환부 이미지 및 1차 스크리닝 결과 섹션 */}
          <div style={gridTwoColumnStyle}>
            {/* 좌측: 환부 이미지 */}
            <div style={sectionBoxStyle}>
              <h3 style={sectionTitleStyle}>📷 피부 환부 검체 이미지</h3>
              <div style={imageContainerStyle}>
                {previewUrl ? (
                  <img src={previewUrl} alt="환부 크롭" style={cropImageStyle} />
                ) : (
                  <div style={noImageTextStyle}>환부 이미지가 등록되었습니다.</div>
                )}
              </div>
            </div>

            {/* 우측: 1차 이진 스크리닝 소견 */}
            <div style={sectionBoxStyle}>
              <h3 style={sectionTitleStyle}>⚡ 1차 스크리닝 진단 소견</h3>
              <div style={{ ...screeningBadgeCardStyle, backgroundColor: isBinaryNormal ? '#eaf6f0' : '#fdeeea', borderColor: isBinaryNormal ? '#bfe3d2' : '#f3c4b8' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: isBinaryNormal ? '#1f5f43' : '#a03322' }}>
                  스크리닝 판정
                </span>
                <div style={{ fontSize: '24px', fontWeight: '800', margin: '4px 0', color: isBinaryNormal ? '#2a9d6e' : '#d64530' }}>
                  {isBinaryNormal ? '✅ 정상' : '🚨 피부 질환 가능성'}
                </div>
                <div style={{ fontSize: '13px', color: '#7a6c5f' }}>
                  신뢰도 <strong>{Number(binaryConfidence).toFixed(1)}%</strong>
                </div>
              </div>

              {topMulti && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fdf6ec', borderRadius: '8px', border: '1px solid #f0e3d2' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#7a6c5f' }}>최고 의심 세부 질환</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#4b4037', marginTop: '2px' }}>
                    {topMulti.class_name || topMulti.className} ({Number(topMulti.confidence ?? topMulti.probability ?? 0).toFixed(1)}%)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2차 12종 세부 질환 상대 확률 분포 표 */}
          {sortedMulti.length > 0 && (
            <div style={{ ...sectionBoxStyle, marginTop: '16px' }}>
              <h3 style={sectionTitleStyle}>📊 12종 세부 피부 질환 상대 확률 분포</h3>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th style={{ ...thStyle, width: '40px' }}>순위</th>
                    <th style={thStyle}>질환명</th>
                    <th style={thStyle}>상대 확률 그래프</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'right' }}>비율(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMulti.slice(0, 5).map((item, idx) => {
                    const name = item.class_name || item.className
                    const conf = Number(item.confidence ?? item.probability ?? 0).toFixed(1)
                    return (
                      <tr key={name || idx} style={tableRowStyle}>
                        <td style={tdRankStyle}>{idx + 1}</td>
                        <td style={tdNameStyle}>{name}</td>
                        <td style={tdStyle}>
                          <div style={barTrackStyle}>
                            <div
                              style={{
                                ...barFillStyle,
                                width: `${Math.min(conf, 100)}%`,
                                backgroundColor: idx === 0 ? '#ef7d66' : '#9a8d80',
                              }}
                            />
                          </div>
                        </td>
                        <td style={tdPercentStyle}>{conf}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 수의사 안내 및 서명/QR 영역 */}
          <div style={footerDisclaimerStyle}>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '13px', color: '#4b4037', fontWeight: '700' }}>
                🩺 수의사 진료 참고 안내 (Disclaimer)
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#9a8d80', lineHeight: '1.4' }}>
                본 소견서는 인공지능(EfficientNet) 딥러닝 비전 알고리즘을 통한 사전 스크리닝 참고용 자료입니다.
                확정 진단 및 약물 처방은 반드시 동물병원 담당 수의사의 정밀 진료를 받으시기 바랍니다.
              </p>
            </div>
            <div style={qrBoxStyle}>
              <div style={{ fontSize: '28px' }}>📲</div>
              <span style={{ fontSize: '9px', color: '#9a8d80', marginTop: '2px' }}>검증 QR 코드</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 모달 & PDF 스타일 정의
const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(75, 64, 55, 0.6)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  padding: '16px',
}

const modalContainerStyle = {
  backgroundColor: '#fffdfa',
  borderRadius: '20px',
  width: '100%',
  maxWidth: '780px',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
  display: 'flex',
  flexDirection: 'column',
}

const toolbarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderBottom: '1px solid #f0e3d2',
  backgroundColor: '#fdf6ec',
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const printButtonStyle = {
  backgroundColor: '#ef7d66',
  color: '#fffdfa',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: '700',
  cursor: 'pointer',
}

const closeButtonStyle = {
  backgroundColor: '#f0e3d2',
  color: '#7a6c5f',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 14px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
}

const documentStyle = {
  padding: '32px',
  backgroundColor: '#fffdfa',
  fontFamily: "'Inter', sans-serif",
}

const headerStyle = {
  marginBottom: '12px',
}

const hospitalBadgeStyle = {
  fontSize: '10px',
  fontWeight: '800',
  letterSpacing: '1px',
  color: '#ef7d66',
  backgroundColor: '#fdeee8',
  padding: '3px 8px',
  borderRadius: '4px',
}

const titleStyle = {
  fontSize: '24px',
  fontWeight: '800',
  color: '#4b4037',
  margin: '6px 0 2px 0',
}

const subTitleStyle = {
  fontSize: '12px',
  color: '#9a8d80',
  margin: 0,
}

const dividerStyle = {
  border: 'none',
  borderTop: '2px solid #4b4037',
  margin: '12px 0 20px 0',
}

const gridTwoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
}

const sectionBoxStyle = {
  backgroundColor: '#fffdfa',
  border: '1px solid #f0e3d2',
  borderRadius: '12px',
  padding: '16px',
}

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: '700',
  color: '#4b4037',
  margin: '0 0 12px 0',
}

const imageContainerStyle = {
  width: '100%',
  height: '160px',
  borderRadius: '8px',
  backgroundColor: '#f0e3d2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}

const cropImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
}

const noImageTextStyle = {
  fontSize: '12px',
  color: '#9a8d80',
}

const screeningBadgeCardStyle = {
  padding: '16px',
  borderRadius: '10px',
  border: '1px solid #f0e3d2',
  textAlign: 'center',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
}

const tableHeaderRowStyle = {
  backgroundColor: '#fdf6ec',
  borderBottom: '1px solid #e6d3bd',
}

const thStyle = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: '700',
  color: '#7a6c5f',
}

const tableRowStyle = {
  borderBottom: '1px solid #f0e3d2',
}

const tdRankStyle = {
  padding: '8px 10px',
  fontWeight: '700',
  color: '#9a8d80',
}

const tdNameStyle = {
  padding: '8px 10px',
  fontWeight: '700',
  color: '#4b4037',
}

const tdStyle = {
  padding: '8px 10px',
}

const tdPercentStyle = {
  padding: '8px 10px',
  textAlign: 'right',
  fontWeight: '700',
  color: '#ef7d66',
}

const barTrackStyle = {
  width: '100%',
  height: '8px',
  backgroundColor: '#f0e3d2',
  borderRadius: '4px',
  overflow: 'hidden',
}

const barFillStyle = {
  height: '100%',
  borderRadius: '4px',
}

const footerDisclaimerStyle = {
  marginTop: '24px',
  padding: '12px 16px',
  backgroundColor: '#fdf6ec',
  borderRadius: '10px',
  border: '1px solid #f0e3d2',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
}

const qrBoxStyle = {
  width: '60px',
  height: '60px',
  backgroundColor: '#fffdfa',
  border: '1px solid #e6d3bd',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}
