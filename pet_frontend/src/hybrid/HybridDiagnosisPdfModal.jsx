import React from 'react'

/**
 * HybridDiagnosisPdfModal - 바이오센서 수치 + 스마트 문진 종합 건강 진단서 A4 PDF 모달.
 *
 * @param {boolean} isOpen 모달 열림 여부
 * @param {function} onClose 모달 닫기 핸들러
 * @param {object} formData 나이, 체중, CRP, IgG, IL-6, 선택된 증상 칩 및 텍스트 프롬프트
 * @param {object} result 백엔드 하이브리드 진단 결과 (status, is_normal, confidence, details 등)
 */
export function HybridDiagnosisPdfModal({ isOpen, onClose, formData, result }) {
  if (!isOpen) return null

  const isNormal = result?.is_normal ?? result?.status === 'NOR'
  const confidence = result?.confidence ?? 92.4
  const details = result?.details || '바이오센서 수치 및 스마트 문진 데이터를 기반으로 종합 판정이 수행되었습니다.'

  // 수치 안전 추출
  const crpVal = Number(formData?.crp ?? 1.2).toFixed(2)
  const iggVal = Number(formData?.igg ?? 3.85).toFixed(2)
  const il6Val = Number(formData?.il6 ?? 3.81).toFixed(2)

  // 정상 범위 한계
  const isCrpAbnormal = Number(crpVal) > 2.0
  const isIggAbnormal = Number(iggVal) > 3.5
  const isIl6Abnormal = Number(il6Val) > 2.5

  // 발급 일시 및 문서 번호 생성
  const todayStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const docNo = `HARU-HYBRID-${Math.floor(100000 + Math.random() * 900000)}`

  // PDF 인쇄 / 다운로드 실행 (파일명 고유 지정 및 덮어쓰기 방지)
  const handlePrint = () => {
    const originalTitle = document.title
    document.title = `바이오센서_종합건강진단서_${docNo}`
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
        {/* 상단 툴바 */}
        <div style={toolbarStyle} className="pdf-no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <span style={{ fontWeight: '700', fontSize: '16px', color: '#1E293B' }}>
              바이오센서 종합 건강 진단서 미리보기
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
          {/* 헤더 */}
          <div style={headerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={hospitalBadgeStyle}>BIOMARKER & NLP HEALTH REPORT</span>
                <h1 style={titleStyle}>바이오센서 종합 건강 진단서</h1>
                <p style={subTitleStyle}>HaruBread Pet Hybrid Biomarker Clinical Diagnostic Document</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748B' }}>문서번호: {docNo}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>발급일: {todayStr}</div>
              </div>
            </div>
          </div>

          <hr style={dividerStyle} />

          {/* 반려동물 기본 스펙 & 종합 소견 카드 */}
          <div style={gridTwoColumnStyle}>
            {/* 개체 기본 프로필 */}
            <div style={sectionBoxStyle}>
              <h3 style={sectionTitleStyle}>🐕 반려동물 신체 스펙</h3>
              <div style={profileGridStyle}>
                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>추정 나이</span>
                  <span style={profileValueStyle}>{formData?.age ?? 2.0}세</span>
                </div>
                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>체중</span>
                  <span style={profileValueStyle}>{formData?.weight ?? 5.8}kg</span>
                </div>
                <div style={profileItemStyle}>
                  <span style={profileLabelStyle}>검사 상태</span>
                  <span style={{ ...profileValueStyle, color: isNormal ? '#059669' : '#DC2626' }}>
                    {isNormal ? '정상 관리군' : '정밀 진료 대상'}
                  </span>
                </div>
              </div>
            </div>

            {/* 종합 소견 배너 */}
            <div style={{ ...sectionBoxStyle, backgroundColor: isNormal ? '#F0FDF4' : '#FEF2F2', borderColor: isNormal ? '#BBF7D0' : '#FECACA' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: isNormal ? '#166534' : '#991B1B' }}>
                AI 종합 판정 결과
              </span>
              <div style={{ fontSize: '22px', fontWeight: '800', margin: '6px 0', color: isNormal ? '#15803D' : '#DC2626' }}>
                {isNormal ? '✅ NOR (정상 범주)' : '🚨 ABN (수의사 진료 권장)'}
              </div>
              <div style={{ fontSize: '13px', color: '#475569' }}>
                분석 신뢰도 <strong>{Number(confidence).toFixed(1)}%</strong>
              </div>
            </div>
          </div>

          {/* 3종 바이오센서 수치 세부 서식 */}
          <div style={{ ...sectionBoxStyle, marginTop: '16px' }}>
            <h3 style={sectionTitleStyle}>🧪 바이오센서 3종 실시간 정밀 수치</h3>
            <div style={sensorGridStyle}>
              {/* CRP */}
              <div style={{ ...sensorCardStyle, borderColor: isCrpAbnormal ? '#FCA5A5' : '#CBD5E1' }}>
                <span style={sensorNameStyle}>CRP (C-반응성 단백질)</span>
                <div style={{ ...sensorValueStyle, color: isCrpAbnormal ? '#DC2626' : '#0F172A' }}>
                  {crpVal} <span style={unitStyle}>mg/L</span>
                </div>
                <span style={referenceStyle}>정상 기준: ≤ 2.0 mg/L {isCrpAbnormal && '(주의 수치)'}</span>
              </div>

              {/* IgG */}
              <div style={{ ...sensorCardStyle, borderColor: isIggAbnormal ? '#FCA5A5' : '#CBD5E1' }}>
                <span style={sensorNameStyle}>IgG (면역 글로불린 G)</span>
                <div style={{ ...sensorValueStyle, color: isIggAbnormal ? '#DC2626' : '#0F172A' }}>
                  {iggVal} <span style={unitStyle}>g/L</span>
                </div>
                <span style={referenceStyle}>정상 기준: ≤ 3.5 g/L {isIggAbnormal && '(주의 수치)'}</span>
              </div>

              {/* IL-6 */}
              <div style={{ ...sensorCardStyle, borderColor: isIl6Abnormal ? '#FCA5A5' : '#CBD5E1' }}>
                <span style={sensorNameStyle}>IL-6 (인터루킨-6)</span>
                <div style={{ ...sensorValueStyle, color: isIl6Abnormal ? '#DC2626' : '#0F172A' }}>
                  {il6Val} <span style={unitStyle}>pg/mL</span>
                </div>
                <span style={referenceStyle}>정상 기준: ≤ 2.5 pg/mL {isIl6Abnormal && '(주의 수치)'}</span>
              </div>
            </div>
          </div>

          {/* 스마트 문진 및 상세 소견 */}
          <div style={{ ...sectionBoxStyle, marginTop: '16px' }}>
            <h3 style={sectionTitleStyle}>📝 보호자 스마트 문진 기록 & 종합 소견</h3>
            <div style={symptomTextBoxStyle}>
              <strong>상세 증상 및 작성 메모:</strong>
              <p style={{ margin: '4px 0 0 0', color: '#334155' }}>
                {formData?.text_prompt || '별도 입력된 서술형 증상이 없습니다.'}
              </p>
            </div>
            <div style={detailsBoxStyle}>
              <strong>AI 정밀 분석 소견:</strong>
              <p style={{ margin: '4px 0 0 0', color: '#1E293B' }}>{details}</p>
            </div>
          </div>

          {/* 수의사 안내 및 QR */}
          <div style={footerDisclaimerStyle}>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '13px', color: '#1E293B', fontWeight: '700' }}>
                🩺 수의사 정밀 진료 안내 (Clinical Notice)
              </h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748B', lineHeight: '1.4' }}>
                본 진단서는 바이오센서 수치(CRP, IgG, IL-6) 및 보호자 문진 기반 스크리닝 참고서입니다.
                염증 수치 상승 또는 응급 증상이 있을 경우 즉시 수의사의 정밀 진료 및 혈액 검사를 진행하세요.
              </p>
            </div>
            <div style={qrBoxStyle}>
              <div style={{ fontSize: '28px' }}>📲</div>
              <span style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>검증 QR 코드</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 스타일 정의
const backdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999,
  padding: '16px',
}

const modalContainerStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
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
  borderBottom: '1px solid #E2E8F0',
  backgroundColor: '#F8FAFC',
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const printButtonStyle = {
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: '700',
  cursor: 'pointer',
}

const closeButtonStyle = {
  backgroundColor: '#E2E8F0',
  color: '#475569',
  border: 'none',
  borderRadius: '8px',
  padding: '8px 14px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
}

const documentStyle = {
  padding: '32px',
  backgroundColor: '#FFFFFF',
  fontFamily: "'Inter', sans-serif",
}

const headerStyle = {
  marginBottom: '12px',
}

const hospitalBadgeStyle = {
  fontSize: '10px',
  fontWeight: '800',
  letterSpacing: '1px',
  color: '#059669',
  backgroundColor: '#ECFDF5',
  padding: '3px 8px',
  borderRadius: '4px',
}

const titleStyle = {
  fontSize: '24px',
  fontWeight: '800',
  color: '#0F172A',
  margin: '6px 0 2px 0',
}

const subTitleStyle = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
}

const dividerStyle = {
  border: 'none',
  borderTop: '2px solid #0F172A',
  margin: '12px 0 20px 0',
}

const gridTwoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '16px',
}

const sectionBoxStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '16px',
}

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: '700',
  color: '#1E293B',
  margin: '0 0 12px 0',
}

const profileGridStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const profileItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '13px',
  paddingBottom: '4px',
  borderBottom: '1px dashed #E2E8F0',
}

const profileLabelStyle = {
  color: '#64748B',
}

const profileValueStyle = {
  fontWeight: '700',
  color: '#0F172A',
}

const sensorGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: '12px',
}

const sensorCardStyle = {
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid #CBD5E1',
  backgroundColor: '#F8FAFC',
  textAlign: 'center',
}

const sensorNameStyle = {
  fontSize: '11px',
  fontWeight: '700',
  color: '#475569',
  display: 'block',
}

const sensorValueStyle = {
  fontSize: '18px',
  fontWeight: '800',
  margin: '4px 0',
}

const unitStyle = {
  fontSize: '11px',
  fontWeight: '500',
  color: '#64748B',
}

const referenceStyle = {
  fontSize: '10px',
  color: '#64748B',
}

const symptomTextBoxStyle = {
  fontSize: '12px',
  padding: '10px',
  backgroundColor: '#F8FAFC',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  marginBottom: '10px',
}

const detailsBoxStyle = {
  fontSize: '12px',
  padding: '10px',
  backgroundColor: '#EEF2FF',
  borderRadius: '8px',
  border: '1px solid #C7D2FE',
}

const footerDisclaimerStyle = {
  marginTop: '24px',
  padding: '12px 16px',
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  border: '1px solid #E2E8F0',
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
}

const qrBoxStyle = {
  width: '60px',
  height: '60px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
}
