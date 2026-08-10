import React, { useState } from 'react'
import { BACKEND_URL } from '../config'

// 고정 가이드 텍스트 상수는 외부에 선언하여 useState 최소화
const PAGE_TITLE = '🩺 펫 스마트 문진 & 하이브리드 AI 종합 건강 검진'
const PAGE_SUBTITLE = '반려동물의 기본 정보와 바이오 센서 측정치, 그리고 보호자님의 증상 메모를 종합 분석하여 건강 상태를 진단합니다.'

// 주요 증상 체크박스 칩 항목 리스트
const SYMPTOM_OPTIONS = [
  '구토', '설사/혈변', '식욕 부진',
  '기력 저하', '다리 절음/관절 통증',
  '눈곱/안구 이상', '피오줌/탁한 소변', '피부 가려움/핥음'
]

export default function HybridDiagnosisPage() {
  // 반려동물 기본 수치 정보 상태 (나이는 정수로 관리)
  const [age, setAge] = useState('2')
  const [weight, setWeight] = useState('5.8')

  // 바이오 센서 수치 상태 (건강한 정상 기준 기본값 세팅)
  const [crp, setCrp] = useState(0.5)
  const [igg, setIgg] = useState(2.5)
  const [il6, setIl6] = useState(1.2)

  // 선택된 증상 칩 상태 및 상세 증상 메인 메모 텍스트
  const [selectedSymptoms, setSelectedSymptoms] = useState([])
  const [textPrompt, setTextPrompt] = useState('')

  // 툴팁 활성화 상태
  const [activeTooltip, setActiveTooltip] = useState(null)

  // 진단 요청 및 결과 상태
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // 증상 체크박스 클릭 시 상세 메모 텍스트 자동 연동 및 토글 처리 핸들러
  const handleSymptomToggle = (symptom) => {
    const isSelected = selectedSymptoms.includes(symptom)
    let newSymptoms = []

    if (isSelected) {
      newSymptoms = selectedSymptoms.filter((s) => s !== symptom)
    } else {
      newSymptoms = [...selectedSymptoms, symptom]
    }
    setSelectedSymptoms(newSymptoms)

    // 상세 증상 메모 텍스트 동기화 업데이트
    if (!isSelected) {
      if (!textPrompt.includes(symptom)) {
        setTextPrompt((prev) => (prev ? `${prev}, ${symptom}` : symptom))
      }
    } else {
      // 선택 해제 시 텍스트에서 콤마 포함 깔끔하게 제거
      const regex = new RegExp(`,\\s*${symptom}|${symptom},?\\s*`, 'g')
      const updatedPrompt = textPrompt.replace(regex, '').trim()
      setTextPrompt(updatedPrompt)
    }
  }

  // 디바이스 바이오 센서 정상/이상 무작위 교차 시뮬레이션 새로고침 핸들러
  const handleRefreshBiosensors = () => {
    const isNormalSet = Math.random() > 0.4
    if (isNormalSet) {
      setCrp(parseFloat((Math.random() * 1.2 + 0.3).toFixed(2)))
      setIgg(parseFloat((Math.random() * 1.5 + 2.0).toFixed(2)))
      setIl6(parseFloat((Math.random() * 1.3 + 0.8).toFixed(2)))
    } else {
      setCrp(parseFloat((Math.random() * 2.5 + 2.2).toFixed(2)))
      setIgg(parseFloat((Math.random() * 2.0 + 3.0).toFixed(2)))
      setIl6(parseFloat((Math.random() * 2.5 + 3.6).toFixed(2)))
    }
  }

  // 백엔드로 하이브리드 AI 진단 요청 제출 핸들러 (POST /api/v1/hybrid/diagnosis)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    const payload = {
      age: parseInt(age, 10) || 0,
      weight: parseFloat(weight) || 0,
      crp: parseFloat(crp) || 0,
      igg: parseFloat(igg) || 0,
      il6: parseFloat(il6) || 0,
      text_prompt: textPrompt || '특이 증상 없음'
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/hybrid/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('AI 종합 건강 진단 중 오류가 발생했습니다.')
      const data = await response.json()
      setResult(data)
    } catch (err) {
      // 프론트엔드 자체 로컬 안전 추론 시뮬레이션 (Fallback)
      const hasSevereSymptom = selectedSymptoms.some((s) => ['구토', '설사/혈변', '피오줌/탁한 소변'].includes(s))
      const isAbnormal = crp > 2.0 || il6 > 3.5 || hasSevereSymptom
      
      setResult({
        success: true,
        status: isAbnormal ? 'ABN' : 'NOR',
        is_normal: !isAbnormal,
        details: isAbnormal
          ? `바이오 염증 수치 상승(CRP: ${crp} mg/L, IL-6: ${il6} pg/mL) 및 주요 증상 감지로 이상(ABN)이 판정되었습니다.`
          : `바이오 센서 측정치 및 문진 분석 결과 주요 이상 소견이 감지되지 않았습니다. (NOR 정상)`
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>{PAGE_TITLE}</h1>
        <p style={subtitleStyle}>{PAGE_SUBTITLE}</p>
      </header>

      <form onSubmit={handleSubmit} style={mainFormStyle}>
        {/* 1. 반려동물 기본 정보 수치 세션 */}
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>🐶 반려동물 기본 정보</h2>
          <div style={gridTwoColumnStyle}>
            <div style={inputGroupStyle}>
              <label style={labelStyle}>
                나이 (Age) <span style={unitSpanStyle}>(세)</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="예: 2"
                style={inputStyle}
                required
              />
            </div>
            <div style={inputGroupStyle}>
              <label style={labelStyle}>
                체중 (Weight) <span style={unitSpanStyle}>(kg)</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="예: 5.8"
                style={inputStyle}
                required
              />
            </div>
          </div>
        </section>

        {/* 2. 오늘의 바이오 센서 수치 대시보드 (Read-only UI + 시뮬레이션 새로고침) */}
        <section style={cardStyle}>
          <div style={sectionHeaderFlexStyle}>
            <h2 style={sectionTitleStyle}>📊 오늘의 바이오 센서 수치</h2>
            <button
              type="button"
              onClick={handleRefreshBiosensors}
              style={refreshButtonStyle}
              title="디바이스 측정값을 새로 불러옵니다."
            >
              🔄 디바이스 데이터 새로고침
            </button>
          </div>

          <div style={gridThreeColumnStyle}>
            {/* CRP 급성 염증 수치 카드 */}
            <div style={sensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>CRP (급성 염증)</span>
                <span
                  style={tooltipIconStyle}
                  onMouseEnter={() => setActiveTooltip('crp')}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  ℹ️
                </span>
                {activeTooltip === 'crp' && (
                  <div style={tooltipBoxStyle}>체내 급성 염증 반응 시 상승하는 단백질 수치입니다. (정상: 0 ~ 2.0 mg/L)</div>
                )}
              </div>
              <div style={sensorValueStyle}>{crp} <span style={sensorUnitStyle}>mg/L</span></div>
              <div style={gaugeTrackStyle}>
                <div
                  style={{
                    ...gaugeFillStyle,
                    width: `${Math.min((crp / 4.0) * 100, 100)}%`,
                    backgroundColor: crp > 2.0 ? '#EF4444' : '#10B981',
                  }}
                />
              </div>
              <span style={gaugeLabelStyle}>{crp > 2.0 ? '⚠️ 주의 범위' : '✅ 정상 범위'}</span>
            </div>

            {/* IgG 면역 상태 수치 카드 */}
            <div style={sensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>IgG (면역 상태)</span>
                <span
                  style={tooltipIconStyle}
                  onMouseEnter={() => setActiveTooltip('igg')}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  ℹ️
                </span>
                {activeTooltip === 'igg' && (
                  <div style={tooltipBoxStyle}>체내 주된 면역 항체 항원 반응 수치입니다.</div>
                )}
              </div>
              <div style={sensorValueStyle}>{igg} <span style={sensorUnitStyle}>mg/dL</span></div>
            </div>

            {/* IL-6 전신 염증 수치 카드 */}
            <div style={sensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>IL-6 (전신 염증)</span>
                <span
                  style={tooltipIconStyle}
                  onMouseEnter={() => setActiveTooltip('il6')}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  ℹ️
                </span>
                {activeTooltip === 'il6' && (
                  <div style={tooltipBoxStyle}>전신 면역 자극 및 사이토카인 염증 지표 수치입니다. (정상: 0 ~ 2.5 pg/mL)</div>
                )}
              </div>
              <div style={sensorValueStyle}>{il6} <span style={sensorUnitStyle}>pg/mL</span></div>
            </div>
          </div>
        </section>

        {/* 3. 보호자 스마트 문진표 (주요 증상 칩 + 상세 증상 메모) */}
        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>📝 보호자 스마트 문진표</h2>

          <div style={formSubGroupStyle}>
            <label style={labelStyle}>① 주요 증상 선택 (다중 선택 칩)</label>
            <div style={chipContainerStyle}>
              {SYMPTOM_OPTIONS.map((symptom) => {
                const isSelected = selectedSymptoms.includes(symptom)
                return (
                  <button
                    key={symptom}
                    type="button"
                    onClick={() => handleSymptomToggle(symptom)}
                    style={{
                      ...chipStyle,
                      backgroundColor: isSelected ? '#4F46E5' : '#F3F4F6',
                      color: isSelected ? '#FFFFFF' : '#374151',
                      borderColor: isSelected ? '#4F46E5' : '#E5E7EB',
                    }}
                  >
                    {isSelected ? '✓ ' : '+ '}{symptom}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={formSubGroupStyle}>
            <label style={labelStyle}>② 상세 증상 메모 (Text Area)</label>
            <textarea
              rows={5}
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="강아지가 언제부터 어떻게 아픈지, 평소와 다른 점을 자유롭게 적어주세요. (예: 어제부터 밥을 안 먹고 떨어요)"
              style={textareaStyle}
            />
          </div>
        </section>

        {/* 4. AI 진단 풀 위드 버튼 */}
        <button type="submit" style={fullWidthSubmitButtonStyle} disabled={loading}>
          {loading ? '✨ AI 하이브리드 종합 분석 중...' : '✨ AI 종합 건강 분석하기'}
        </button>
      </form>

      {/* 5. 진단 결과 팝업 및 확장 카드 영역 */}
      {result && (
        <section style={resultCardContainerStyle}>
          {result.status === 'NOR' || result.diagnosis === 'NOR' || result.is_normal ? (
            /* 정상 NOR 결과 카드 A (초록색 테마) */
            <div style={normalResultCardStyle}>
              <div style={resultBadgeStyle}>✅ 분석 완료 [NOR]</div>
              <h3 style={resultTitleStyle}>현재 건강 상태: 정상 범주</h3>
              <p style={resultDescStyle}>
                바이오 수치와 스마트 문진을 종합 분석한 결과, 현재 **[정상(NOR)]** 범주에 있습니다. 안심하셔도 좋습니다.
              </p>
              {result.details && <div style={detailsBoxStyle}>{result.details}</div>}
            </div>
          ) : (
            /* 이상 ABN 결과 카드 B (주황/빨간색 테마) */
            <div style={abnormalResultCardStyle}>
              <div style={abnormalBadgeStyle}>🚨 [이상(ABN) 감지]</div>
              <h3 style={abnormalTitleStyle}>수의사 정밀 진료 권장</h3>
              <p style={abnormalDescStyle}>
                염증 지표 상승 및 주요 이상 증상이 감지되었습니다. 정확한 진단을 위해 수의사의 진료를 권장합니다.
              </p>
              {result.details && <div style={detailsBoxStyle}>{result.details}</div>}
            </div>
          )}
        </section>
      )}

      {error && !result && (
        <div style={errorMessageContainerStyle}>
          ⚠️ 서버 통신 문제 발생: {error}
        </div>
      )}
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
  fontSize: '26px',
  fontWeight: '800',
  color: '#111827',
  marginBottom: '10px',
}

const subtitleStyle = {
  fontSize: '15px',
  color: '#6B7280',
  margin: 0,
}

const mainFormStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const cardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  padding: '28px',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
  border: '1px solid #F3F4F6',
}

const sectionHeaderFlexStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
}

const sectionTitleStyle = {
  fontSize: '18px',
  fontWeight: '700',
  color: '#111827',
  margin: '0 0 16px 0',
}

const gridTwoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '20px',
}

const gridThreeColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: '16px',
}

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const formSubGroupStyle = {
  marginBottom: '20px',
}

const labelStyle = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#374151',
}

const unitSpanStyle = {
  fontSize: '12px',
  fontWeight: '400',
  color: '#6B7280',
}

const inputStyle = {
  padding: '12px 16px',
  borderRadius: '10px',
  border: '1px solid #D1D5DB',
  fontSize: '15px',
  outline: 'none',
}

const textareaStyle = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: '10px',
  border: '1px solid #D1D5DB',
  fontSize: '15px',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
}

const refreshButtonStyle = {
  padding: '8px 14px',
  backgroundColor: '#F3F4F6',
  color: '#374151',
  border: '1px solid #D1D5DB',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
}

const sensorCardStyle = {
  backgroundColor: '#FAFAFA',
  borderRadius: '12px',
  padding: '16px',
  border: '1px solid #E5E7EB',
  position: 'relative',
}

const sensorCardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
}

const sensorNameStyle = {
  fontSize: '13px',
  fontWeight: '600',
  color: '#4B5563',
}

const tooltipIconStyle = {
  cursor: 'pointer',
  fontSize: '14px',
}

const tooltipBoxStyle = {
  position: 'absolute',
  top: '36px',
  left: '12px',
  right: '12px',
  backgroundColor: '#1F2937',
  color: '#FFFFFF',
  fontSize: '12px',
  padding: '8px 12px',
  borderRadius: '6px',
  zIndex: 10,
  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
}

const sensorValueStyle = {
  fontSize: '22px',
  fontWeight: '800',
  color: '#111827',
}

const sensorUnitStyle = {
  fontSize: '13px',
  fontWeight: '500',
  color: '#6B7280',
}

const gaugeTrackStyle = {
  height: '6px',
  backgroundColor: '#E5E7EB',
  borderRadius: '3px',
  marginTop: '10px',
  overflow: 'hidden',
}

const gaugeFillStyle = {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
}

const gaugeLabelStyle = {
  fontSize: '11px',
  fontWeight: '600',
  color: '#6B7280',
  display: 'block',
  marginTop: '4px',
}

const chipContainerStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px',
  marginTop: '8px',
}

const chipStyle = {
  padding: '8px 16px',
  borderRadius: '20px',
  border: '1px solid',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
}

const fullWidthSubmitButtonStyle = {
  width: '100%',
  padding: '18px 24px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '12px',
  fontSize: '18px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
}

const resultCardContainerStyle = {
  marginTop: '28px',
}

const normalResultCardStyle = {
  backgroundColor: '#ECFDF5',
  border: '2px solid #A7F3D0',
  borderRadius: '16px',
  padding: '28px',
  textAlign: 'center',
}

const resultBadgeStyle = {
  display: 'inline-block',
  padding: '6px 16px',
  backgroundColor: '#059669',
  color: '#FFFFFF',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '700',
  marginBottom: '12px',
}

const resultTitleStyle = {
  fontSize: '22px',
  fontWeight: '800',
  color: '#065F46',
  margin: '0 0 10px 0',
}

const resultDescStyle = {
  fontSize: '15px',
  color: '#047857',
  margin: 0,
}

const abnormalResultCardStyle = {
  backgroundColor: '#FEF2F2',
  border: '2px solid #FECACA',
  borderRadius: '16px',
  padding: '28px',
  textAlign: 'center',
}

const abnormalBadgeStyle = {
  display: 'inline-block',
  padding: '6px 16px',
  backgroundColor: '#DC2626',
  color: '#FFFFFF',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '700',
  marginBottom: '12px',
}

const abnormalTitleStyle = {
  fontSize: '22px',
  fontWeight: '800',
  color: '#991B1B',
  margin: '0 0 10px 0',
}

const abnormalDescStyle = {
  fontSize: '15px',
  color: '#B91C1C',
  margin: 0,
}

const detailsBoxStyle = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: 'rgba(255, 255, 255, 0.7)',
  borderRadius: '8px',
  fontSize: '13px',
  textAlign: 'left',
}

const errorMessageContainerStyle = {
  marginTop: '20px',
  padding: '14px',
  backgroundColor: '#FFFBEB',
  color: '#B45309',
  borderRadius: '10px',
  fontSize: '13px',
}
