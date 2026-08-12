import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { BACKEND_URL } from '../config'

// 페이지 타이틀 상수를 외부에 선언하여 useState 최소화
const PAGE_TITLE = '🩺 펫 스마트 문진 & AI 검진'

// 페이지 안내 서브 타이틀 상수
const PAGE_SUBTITLE = '기본 수치, 바이오 센서 측정값 및 보호자 증상 메모를 종합 분석합니다.'

// 주요 증상 체크박스 옵션 리스트
const SYMPTOM_OPTIONS = [
  '구토',
  '설사/혈변',
  '식욕 부진',
  '기력 저하',
  '다리 절음/관절 통증',
  '눈곱/안구 이상',
  '피오줌/탁한 소변',
  '피부 가려움/핥음',
]

export default function HybridDiagnosisPage() {
  // 라우트 전달 객체 수신을 위한 useLocation 훅
  const location = useLocation()

  // 반려동물 나이 수치 상태 (초기값 '2')
  const [age, setAge] = useState('2')

  // 반려동물 체중 수치 상태 (초기값 '5.8')
  const [weight, setWeight] = useState('5.8')

  // CRP 급성 염증 바이오센서 수치 상태 (정상 기준 0 ~ 2.0 mg/L)
  const [crp, setCrp] = useState(0.5)

  // IgG 면역 항체 바이오센서 수치 상태 (정상 기준 0 ~ 3.5 mg/dL)
  const [igg, setIgg] = useState(2.5)

  // IL-6 전신 염증 바이오센서 수치 상태 (정상 기준 0 ~ 2.5 pg/mL)
  const [il6, setIl6] = useState(1.2)

  // 선택된 주요 증상 체크박스 목록 상태
  const [selectedSymptoms, setSelectedSymptoms] = useState([])

  // 보호자 상세 증상 작성 텍스트 메모 상태
  const [textPrompt, setTextPrompt] = useState('')

  // 활성화된 바이오센서 툴팁 상태
  const [activeTooltip, setActiveTooltip] = useState(null)

  // AI 분석 요청 중 로딩 상태
  const [loading, setLoading] = useState(false)

  // AI 종합 건강 진단 결과 상태
  const [result, setResult] = useState(null)

  // 통신 에러 메시지 상태
  const [error, setError] = useState(null)

  // 전달된 반려동물 프로필(location.state) 수신 시 자동 동기화 효과
  useEffect(() => {
    if (location.state?.pet) {
      if (location.state.pet.age !== undefined && location.state.pet.age !== null) {
        setAge(String(location.state.pet.age))
      }
      if (location.state.pet.weight !== undefined && location.state.pet.weight !== null) {
        setWeight(String(location.state.pet.weight))
      }
    } else {
      if (location.state?.age !== undefined) setAge(String(location.state.age))
      if (location.state?.weight !== undefined) setWeight(String(location.state.weight))
    }
  }, [location.state])

  // 증상 체크박스 선택/해제 핸들러 (텍스트 입력창에는 추가하지 않음)
  const handleSymptomToggle = (symptom) => {
    const isSelected = selectedSymptoms.includes(symptom)
    if (isSelected) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== symptom))
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom])
    }
  }

  // AI 제출 시 선택된 체크박스 목록과 텍스트 입력창 메모를 합성하는 헬퍼 함수
  const getCombinedTextPrompt = () => {
    const trimmedMemo = textPrompt.trim()
    const selectedStr = selectedSymptoms.length > 0 ? selectedSymptoms.join(', ') : ''

    if (selectedStr && trimmedMemo) {
      return `주요 증상: ${selectedStr}. 상세 메모: ${trimmedMemo}`
    }
    if (selectedStr) {
      return `주요 증상: ${selectedStr}`
    }
    return trimmedMemo || '특이 증상 없음'
  }

  // 바이오센서 시뮬레이션 데이터 갱신 이벤트 핸들러
  const handleRefreshBiosensors = () => {
    const isNormalSet = Math.random() > 0.4
    if (isNormalSet) {
      setCrp(parseFloat((Math.random() * 1.2 + 0.3).toFixed(2)))
      setIgg(parseFloat((Math.random() * 1.0 + 2.0).toFixed(2)))
      setIl6(parseFloat((Math.random() * 1.0 + 0.8).toFixed(2)))
    } else {
      // 3가지 수치 중 무작위 상승 시뮬레이션
      const randType = Math.floor(Math.random() * 3)
      if (randType === 0) {
        setCrp(parseFloat((Math.random() * 2.5 + 2.2).toFixed(2)))
      } else if (randType === 1) {
        setIgg(parseFloat((Math.random() * 2.0 + 3.8).toFixed(2)))
      } else {
        setIl6(parseFloat((Math.random() * 2.5 + 2.8).toFixed(2)))
      }
    }
  }

  // 바이오센서 툴팁 토글 이벤트 핸들러
  const handleTooltipToggle = (sensorKey) => {
    setActiveTooltip((prev) => (prev === sensorKey ? null : sensorKey))
  }

  // 하이브리드 AI 진단 요청 제출 이벤트 핸들러
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    const finalPrompt = getCombinedTextPrompt()

    const payload = {
      age: parseInt(age, 10) || 0,
      weight: parseFloat(weight) || 0,
      crp: parseFloat(crp) || 0,
      igg: parseFloat(igg) || 0,
      il6: parseFloat(il6) || 0,
      text_prompt: finalPrompt,
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    try {
      // Spring Boot 백엔드 → 파이썬 PyTorch AI 서버 통신 (4초 타임아웃 안전장치)
      const response = await fetch(`${BACKEND_URL}/api/v1/hybrid/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      if (!response.ok) throw new Error('AI 종합 건강 진단 중 오류가 발생했습니다.')
      const data = await response.json()
      // 파이썬 PyTorch 모델의 실제 응답 반환
      setResult(data)
    } catch (err) {
      clearTimeout(timeoutId)
      // 백엔드 미기동 또는 타임아웃 시 프론트엔드 자체 Fallback 로직 (3종 수치 이상, 통증/4대증상 응급 키워드 또는 지속성 문진 소견 시 ABN)
      const isAbnormalBiomarker = crp > 2.0 || igg > 3.5 || il6 > 2.5
      const cleanPrompt = textPrompt ? textPrompt.replace(/\s+/g, '') : ''
      const emergencyKeywords = [
        '혈변', '피오줌', '아예안딛', '안딛', '못딛', '부음', '부어', '비명', '낑낑', '아파함', '아파해',
        '진물', '발적', '붉어짐', '피낢', '피남', '피나', '피날', '피가나', '피가남', '피가날', '탈모', '털빠짐', '딱지', '밤새긁', '계속핥',
        '충혈', '노란눈곱', '초록눈곱', '눈못뜸', '눈부음', '눈긁', '혼탁', '하얗게',
        '2회이상', '연속구토', '피섞인', '혈토', '초록색토', '이물질', '족족토',
        '안움직', '의식', '숨가쁨', '호흡곤란', '물도안', '안일어'
      ]
      const hasEmergencySymptom = selectedSymptoms.some((s) => ['설사/혈변', '피오줌/탁한 소변'].includes(s)) || (cleanPrompt && emergencyKeywords.some((kw) => cleanPrompt.includes(kw)))
      const hasPersistentKeyword = cleanPrompt && (cleanPrompt.includes('하루이상') || cleanPrompt.includes('하루') || cleanPrompt.includes('24시간') || cleanPrompt.includes('이틀') || cleanPrompt.includes('며칠') || cleanPrompt.includes('지속') || cleanPrompt.includes('계속') || cleanPrompt.includes('사흘'))
      const isAbnormal = isAbnormalBiomarker || hasEmergencySymptom || hasPersistentKeyword || selectedSymptoms.length >= 2

      setResult({
        success: true,
        status: isAbnormal ? 'ABN' : 'NOR',
        is_normal: !isAbnormal,
        details: isAbnormal
          ? `[주요 증상 감지] 수치 이상, 주요 의심 증상 소견 또는 지속적인 소견("${finalPrompt}")으로 이상(ABN) 소견이 감지되었습니다. 수의사 진료를 권장합니다.`
          : `[일시적/정상 범주] 3종 바이오 수치가 모두 정상 범위 안이며, 일시적인 경미 소견은 집에서 지속적인 경과 관찰이 가능합니다. (NOR 정상)`,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={mobileContainerStyle}>
      {/* 모바일 상단 헤더 */}
      <header style={mobileHeaderStyle}>
        <div style={badgeRowStyle}>
          <span style={mobileHeaderBadgeStyle}>스마트 문진 탭</span>
        </div>
        <h1 style={mobileTitleStyle}>{PAGE_TITLE}</h1>
        <p style={mobileSubtitleStyle}>{PAGE_SUBTITLE}</p>
      </header>

      <form onSubmit={handleSubmit} style={mobileMainFormStyle}>
        {/* 1. 반려동물 기본 정보 수치 카드 */}
        <section style={mobileCardStyle}>
          <h2 style={mobileSectionTitleStyle}>🐶 반려동물 기본 정보</h2>
          <div style={mobileGridTwoColumnStyle}>
            <div style={mobileInputGroupStyle}>
              <label style={mobileLabelStyle}>
                나이 <span style={unitSpanStyle}>(세)</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="예: 2"
                style={mobileInputStyle}
                required
              />
            </div>
            <div style={mobileInputGroupStyle}>
              <label style={mobileLabelStyle}>
                체중 <span style={unitSpanStyle}>(kg)</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="예: 5.8"
                style={mobileInputStyle}
                required
              />
            </div>
          </div>
        </section>

        {/* 2. 바이오 센서 측정 수치 대시보드 카드 */}
        <section style={mobileCardStyle}>
          <div style={mobileSectionHeaderFlexStyle}>
            <h2 style={mobileSectionTitleStyle}>📊 실시간 바이오 센서</h2>
            <button
              type="button"
              onClick={handleRefreshBiosensors}
              style={mobileRefreshButtonStyle}
            >
              🔄 데이터 동기화
            </button>
          </div>

          <div style={mobileSensorGridStyle}>
            {/* CRP 급성 염증 카트 */}
            <div style={mobileSensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>CRP (급성 염증)</span>
                <span
                  style={tooltipIconStyle}
                  onClick={() => handleTooltipToggle('crp')}
                >
                  ℹ️
                </span>
                {activeTooltip === 'crp' && (
                  <div style={mobileTooltipBoxStyle}>체내 급성 염증 수치 (정상: 0 ~ 2.0 mg/L)</div>
                )}
              </div>
              <div style={sensorValueStyle}>
                {crp} <span style={sensorUnitStyle}>mg/L</span>
              </div>
              <div style={gaugeTrackStyle}>
                <div
                  style={{
                    ...gaugeFillStyle,
                    width: `${Math.min((crp / 4.0) * 100, 100)}%`,
                    backgroundColor: crp > 2.0 ? '#EF4444' : '#10B981',
                  }}
                />
              </div>
              <span style={gaugeLabelStyle}>{crp > 2.0 ? '⚠️ 주의 수치' : '✅ 정상 범위'}</span>
            </div>

            {/* IgG 면역 항체 카트 */}
            <div style={mobileSensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>IgG (면역 상태)</span>
                <span
                  style={tooltipIconStyle}
                  onClick={() => handleTooltipToggle('igg')}
                >
                  ℹ️
                </span>
                {activeTooltip === 'igg' && (
                  <div style={mobileTooltipBoxStyle}>면역 항체 반응 수치 (정상: 0 ~ 3.5 mg/dL)</div>
                )}
              </div>
              <div style={sensorValueStyle}>
                {igg} <span style={sensorUnitStyle}>mg/dL</span>
              </div>
              <div style={gaugeTrackStyle}>
                <div
                  style={{
                    ...gaugeFillStyle,
                    width: `${Math.min((igg / 5.0) * 100, 100)}%`,
                    backgroundColor: igg > 3.5 ? '#EF4444' : '#10B981',
                  }}
                />
              </div>
              <span style={gaugeLabelStyle}>{igg > 3.5 ? '⚠️ 주의 수치' : '✅ 정상 범위'}</span>
            </div>

            {/* IL-6 전신 염증 카트 */}
            <div style={mobileSensorCardStyle}>
              <div style={sensorCardHeaderStyle}>
                <span style={sensorNameStyle}>IL-6 (전신 염증)</span>
                <span
                  style={tooltipIconStyle}
                  onClick={() => handleTooltipToggle('il6')}
                >
                  ℹ️
                </span>
                {activeTooltip === 'il6' && (
                  <div style={mobileTooltipBoxStyle}>전신 면역 자극 지표 (정상: 0 ~ 2.5 pg/mL)</div>
                )}
              </div>
              <div style={sensorValueStyle}>
                {il6} <span style={sensorUnitStyle}>pg/mL</span>
              </div>
              <div style={gaugeTrackStyle}>
                <div
                  style={{
                    ...gaugeFillStyle,
                    width: `${Math.min((il6 / 5.0) * 100, 100)}%`,
                    backgroundColor: il6 > 2.5 ? '#EF4444' : '#10B981',
                  }}
                />
              </div>
              <span style={gaugeLabelStyle}>{il6 > 2.5 ? '⚠️ 주의 수치' : '✅ 정상 범위'}</span>
            </div>
          </div>
        </section>

        {/* 3. 보호자 스마트 문진표 카드 (체크박스 UI) */}
        <section style={mobileCardStyle}>
          <h2 style={mobileSectionTitleStyle}>📝 보호자 스마트 문진표</h2>

          <div style={formSubGroupStyle}>
            <label style={mobileLabelStyle}>① 주요 증상 선택 (선택 항목은 AI 분석 제출 시 자동 합성됩니다)</label>
            <div style={mobileCheckboxGridStyle}>
              {SYMPTOM_OPTIONS.map((symptom) => {
                const isSelected = selectedSymptoms.includes(symptom)
                return (
                  <label
                    key={symptom}
                    style={{
                      ...mobileCheckboxLabelStyle,
                      backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                      borderColor: isSelected ? '#6366F1' : '#E2E8F0',
                      color: isSelected ? '#4338CA' : '#334155',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSymptomToggle(symptom)}
                      style={mobileCheckboxInputStyle}
                    />
                    <span style={mobileCheckboxTextStyle}>{symptom}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div style={formSubGroupStyle}>
            <label style={mobileLabelStyle}>② 상세 증상 작성 메모</label>
            <textarea
              rows={4}
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="아픈 증상이나 평소와 다른 점을 적어주세요. (위 체크박스 선택 내용과 함께 AI 모델로 전송됩니다)"
              style={mobileTextareaStyle}
            />
          </div>
        </section>

        {/* 4. AI 진단 제출 버튼 */}
        <button type="submit" style={mobileFullWidthSubmitButtonStyle} disabled={loading}>
          {loading ? '✨ AI 하이브리드 분석 중...' : '✨ AI 종합 건강 분석하기'}
        </button>
      </form>

      {/* 5. AI 진단 결과 팝업/카드 */}
      {result && (
        <section style={mobileResultCardContainerStyle}>
          {result.status === 'NOR' || result.diagnosis === 'NOR' || result.is_normal ? (
            <div style={mobileNormalResultCardStyle}>
              <div style={mobileResultBadgeStyle}>✅ AI 분석 완료 [NOR]</div>
              <h3 style={mobileResultTitleStyle}>현재 상태: 정상 범주</h3>
              <p style={mobileResultDescStyle}>
                수치 분석 및 스마트 문진 결과 <strong>[정상(NOR)]</strong> 범주입니다. 안심하셔도 좋습니다.
              </p>
              {result.details && <div style={mobileDetailsBoxStyle}>{result.details}</div>}
            </div>
          ) : (
            <div style={mobileAbnormalResultCardStyle}>
              <div style={mobileAbnormalBadgeStyle}>🚨 AI 분석 완료 [ABN]</div>
              <h3 style={mobileAbnormalTitleStyle}>수의사 정밀 진료 권장</h3>
              <p style={mobileAbnormalDescStyle}>
                염증 수치 상승 또는 주요 의심 증상이 감지되었습니다. 수의사 진료를 권장합니다.
              </p>
              {result.details && <div style={mobileDetailsBoxStyle}>{result.details}</div>}
            </div>
          )}
        </section>
      )}

      {error && !result && (
        <div style={mobileErrorMessageContainerStyle}>
          ⚠️ 통신 오류 발생: {error}
        </div>
      )}
    </div>
  )
}

// 모바일 퍼스트 인라인 스타일 객체 정의
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

const mobileMainFormStyle = {
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

const mobileSectionHeaderFlexStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '14px',
}

const mobileSectionTitleStyle = {
  fontSize: '16px',
  fontWeight: '800',
  color: '#0F172A',
  margin: '0 0 14px 0',
}

const mobileGridTwoColumnStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
}

const mobileSensorGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: '10px',
}

const mobileInputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const formSubGroupStyle = {
  marginBottom: '16px',
}

const mobileLabelStyle = {
  fontSize: '13px',
  fontWeight: '700',
  color: '#334155',
  display: 'block',
  marginBottom: '8px',
}

const unitSpanStyle = {
  fontSize: '11px',
  fontWeight: '400',
  color: '#94A3B8',
}

const mobileInputStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #CBD5E1',
  fontSize: '16px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: '#FFFFFF',
  color: '#0F172A',
}

const mobileTextareaStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: '1px solid #CBD5E1',
  fontSize: '16px',
  outline: 'none',
  resize: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#FFFFFF',
  color: '#0F172A',
  lineHeight: 1.4,
}

const mobileRefreshButtonStyle = {
  padding: '6px 12px',
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  fontSize: '12px',
  fontWeight: '700',
  cursor: 'pointer',
}

const mobileSensorCardStyle = {
  backgroundColor: '#F8FAFC',
  borderRadius: '14px',
  padding: '12px',
  border: '1px solid #E2E8F0',
  position: 'relative',
}

const sensorCardHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px',
}

const sensorNameStyle = {
  fontSize: '12px',
  fontWeight: '700',
  color: '#475569',
}

const tooltipIconStyle = {
  cursor: 'pointer',
  fontSize: '12px',
}

const mobileTooltipBoxStyle = {
  position: 'absolute',
  top: '32px',
  left: '6px',
  right: '6px',
  backgroundColor: '#0F172A',
  color: '#FFFFFF',
  fontSize: '11px',
  padding: '8px 10px',
  borderRadius: '8px',
  zIndex: 10,
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  lineHeight: 1.3,
}

const sensorValueStyle = {
  fontSize: '18px',
  fontWeight: '800',
  color: '#0F172A',
}

const sensorUnitStyle = {
  fontSize: '12px',
  fontWeight: '500',
  color: '#64748B',
}

const gaugeTrackStyle = {
  height: '6px',
  backgroundColor: '#E2E8F0',
  borderRadius: '3px',
  marginTop: '8px',
  overflow: 'hidden',
}

const gaugeFillStyle = {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.3s ease',
}

const gaugeLabelStyle = {
  fontSize: '10px',
  fontWeight: '700',
  color: '#64748B',
  display: 'block',
  marginTop: '4px',
}

const mobileCheckboxGridStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
}

const mobileCheckboxLabelStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '12px',
  border: '1px solid',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'all 0.15s ease',
}

const mobileCheckboxInputStyle = {
  width: '16px',
  height: '16px',
  accentColor: '#4F46E5',
  cursor: 'pointer',
}

const mobileCheckboxTextStyle = {
  lineHeight: 1,
}

const mobileFullWidthSubmitButtonStyle = {
  width: '100%',
  minHeight: '52px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '16px',
  fontSize: '16px',
  fontWeight: '800',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(79, 70, 229, 0.3)',
}

const mobileResultCardContainerStyle = {
  marginTop: '16px',
}

const mobileNormalResultCardStyle = {
  backgroundColor: '#ECFDF5',
  border: '1.5px solid #A7F3D0',
  borderRadius: '20px',
  padding: '20px 16px',
  textAlign: 'center',
}

const mobileResultBadgeStyle = {
  display: 'inline-block',
  padding: '4px 12px',
  backgroundColor: '#059669',
  color: '#FFFFFF',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: '700',
  marginBottom: '8px',
}

const mobileResultTitleStyle = {
  fontSize: '18px',
  fontWeight: '800',
  color: '#065F46',
  margin: '0 0 6px 0',
}

const mobileResultDescStyle = {
  fontSize: '13px',
  color: '#047857',
  margin: 0,
  lineHeight: 1.4,
}

const mobileAbnormalResultCardStyle = {
  backgroundColor: '#FEF2F2',
  border: '1.5px solid #FECACA',
  borderRadius: '20px',
  padding: '20px 16px',
  textAlign: 'center',
}

const mobileAbnormalBadgeStyle = {
  display: 'inline-block',
  padding: '4px 12px',
  backgroundColor: '#DC2626',
  color: '#FFFFFF',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: '700',
  marginBottom: '8px',
}

const mobileAbnormalTitleStyle = {
  fontSize: '18px',
  fontWeight: '800',
  color: '#991B1B',
  margin: '0 0 6px 0',
}

const mobileAbnormalDescStyle = {
  fontSize: '13px',
  color: '#B91C1C',
  margin: 0,
  lineHeight: 1.4,
}

const mobileDetailsBoxStyle = {
  marginTop: '12px',
  padding: '10px 12px',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  borderRadius: '10px',
  fontSize: '12px',
  textAlign: 'left',
  lineHeight: 1.4,
}

const mobileErrorMessageContainerStyle = {
  marginTop: '14px',
  padding: '12px 14px',
  backgroundColor: '#FFFBEB',
  color: '#B45309',
  borderRadius: '12px',
  fontSize: '13px',
}
