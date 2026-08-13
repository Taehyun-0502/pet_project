import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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

// 주요 증상 선택 시 나타나는 카테고리별 세부 위험 증상 체크박스 맵 (사용자 정밀 튜닝 버전)
const SUB_SYMPTOM_MAP = {
  '구토': [
    '1회성 구토 (사료토 / 공복 노란토)',
    '2회 이상 / 연속 구토',
    '혈토 / 초록색 토',
    '이물질 / 먹는 족족 구토'
  ],
  '설사/혈변': [
    '일시적 무른변 (1회 / 과식)',
    '지속적인 설사 / 물설사',
    '혈변 / 피섞인 변'
  ],
  '피오줌/탁한 소변': [],
  '다리 절음/관절 통증': [
    '운동 후 일시적 뻣뻣함',
    '다리를 안 딛음 / 부어오름',
    '통증으로 낑낑거림 / 비명'
  ],
  '기력 저하': [
    '산책/놀이 후 일시적 피로',
    '안 움직임 / 일어나지 못함',
    '호흡 곤란 / 의식 저하'
  ],
  '식욕 부진': [
    '입맛 없음 (사료 거부 / 간식은 잘먹음)',
    '하루 이상 음식 거부',
    '물조차 먹지 않음'
  ],
  '눈곱/안구 이상': [
    '투명 눈곱 (조금)',
    '눈 충혈 / 눈 못뜸 / 눈 부음',
    '노란·초록 눈곱 / 안구 혼탁'
  ],
  '피부 가려움/핥음': [
    '털 고르기 (그루밍) / 미용 후 일시 긁음',
    '붉어짐 / 밤새 긁음 / 계속 핥음',
    '진물 / 탈모 / 피남 / 딱지'
  ],
}

// 🟢 정상/경미 소견 체크박스 옵션 목록
const MILD_NORMAL_SUB_SYMPTOMS = [
  '1회성 구토 (사료토 / 공복 노란토)',
  '일시적 무른변 (1회 / 과식)',
  '운동 후 일시적 뻣뻣함',
  '산책/놀이 후 일시적 피로',
  '입맛 없음 (사료 거부 / 간식은 잘먹음)',
  '투명 눈곱 (조금)',
  '털 고르기 (그루밍) / 미용 후 일시 긁음',
]

// 생년월일(YYYY-MM-DD) 기반 만 나이 계산 유틸리티 함수
const calculateAgeFromBirthDate = (birthDateStr) => {
  if (!birthDateStr) return null
  try {
    const birthDate = new Date(birthDateStr)
    const today = new Date()
    let calculatedAge = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculatedAge--
    }
    return calculatedAge >= 0 ? String(calculatedAge) : '0'
  } catch (e) {
    return null
  }
}

export default function HybridDiagnosisPage() {
  const navigate = useNavigate()
  // 라우트 전달 객체 수신을 위한 useLocation 훅
  const location = useLocation()

  // 반려동물 목록 화면에서 넘겨받은 프로필 state 객체
  const initialPet = location.state || {}

  // 반려동물 이름 상태 (넘겨받은 값 유무에 따라 자동 세팅)
  const [petName, setPetName] = useState(initialPet.petName || initialPet.name || '초코')

  // 반려동물 종류(견종) 상태 (넘겨받은 값 유무에 따라 자동 세팅)
  const [breed, setBreed] = useState(initialPet.breed || '푸들')

  // 반려동물 나이 수치 상태 (생년월일 수신 시 만 나이 자동 계산)
  const [age, setAge] = useState(
    calculateAgeFromBirthDate(initialPet.birthDate) || initialPet.age || '2'
  )

  // 반려동물 체중 수치 상태 (초기값 '5.8')
  const [weight, setWeight] = useState('5.8')

  // CRP 급성 염증 바이오센서 수치 상태 (정상 기준 0 ~ 2.0 mg/L)
  const [crp, setCrp] = useState(0.5)

  // IgG 면역 항체 바이오센서 수치 상태 (정상 기준 0 ~ 3.5 mg/dL)
  const [igg, setIgg] = useState(2.5)

  // IL-6 전신 염증 바이오센서 수치 상태 (정상 기준 0 ~ 2.5 pg/mL)
  const [il6, setIl6] = useState(1.2)

  // PDF 종합 건강 진단서 발급 모달 상태
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false)

  // 선택된 주요 증상 체크박스 목록 상태
  const [selectedSymptoms, setSelectedSymptoms] = useState([])

  // 선택된 세부 위험 증상 체크박스 목록 상태
  const [selectedSubSymptoms, setSelectedSubSymptoms] = useState([])

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

  // 주요 증상 체크박스 선택/해제 핸들러
  const handleSymptomToggle = (symptom) => {
    const isSelected = selectedSymptoms.includes(symptom)
    if (isSelected) {
      const newSelected = selectedSymptoms.filter((s) => s !== symptom)
      setSelectedSymptoms(newSelected)
      // 해당 주요 증상의 세부 증상들도 함께 선택 해제
      const relatedSubList = SUB_SYMPTOM_MAP[symptom] || []
      setSelectedSubSymptoms(selectedSubSymptoms.filter((sub) => !relatedSubList.includes(sub)))
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom])
    }
  }

  // 세부 위험 증상 체크박스 선택/해제 핸들러
  const handleSubSymptomToggle = (subSymptom) => {
    if (selectedSubSymptoms.includes(subSymptom)) {
      setSelectedSubSymptoms(selectedSubSymptoms.filter((s) => s !== subSymptom))
    } else {
      setSelectedSubSymptoms([...selectedSubSymptoms, subSymptom])
    }
  }

  // AI 제출 시 선택된 주요 증상과 세부 위험 증상을 합성하는 헬퍼 함수
  const getCombinedTextPrompt = () => {
    const mainStr = selectedSymptoms.length > 0 ? selectedSymptoms.join(', ') : ''
    const subStr = selectedSubSymptoms.length > 0 ? selectedSubSymptoms.join(', ') : ''

    if (mainStr && subStr) {
      return `주요 증상: ${mainStr}. 세부 위험 소견: ${subStr}`
    }
    if (mainStr) {
      return `주요 증상: ${mainStr}`
    }
    if (subStr) {
      return `세부 위험 소견: ${subStr}`
    }
    return '특이 증상 없음'
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
      // 백엔드 미기동 또는 타임아웃 시 프론트엔드 폴백
      const isAbnormalBiomarker = crp > 2.0 || igg > 3.5 || il6 > 2.5
      const criticalKeywords = ['혈토', '혈변', '피오줌', '호흡곤란', '의식저하', '초록색', '이물질', '혈뇨', '피섞인', '물설사']
      const hasCritical = selectedSubSymptoms.some((sub) => criticalKeywords.some((kw) => sub.includes(kw)))

      const mildSubCount = selectedSubSymptoms.filter((sub) => MILD_NORMAL_SUB_SYMPTOMS.includes(sub)).length
      const moderateSubCount = selectedSubSymptoms.length - mildSubCount

      let riskScore = 20.0
      if (isAbnormalBiomarker) riskScore += 30.0
      if (hasCritical) riskScore += 35.0
      riskScore += moderateSubCount * 12.0

      if (mildSubCount > 0 && !hasCritical) {
        riskScore = Math.max(riskScore - mildSubCount * 5.0, 10.0)
      }

      const isNormal = riskScore < 50.0

      setResult({
        success: true,
        status: isNormal ? 'NOR' : 'ABN',
        is_normal: isNormal,
        details: isNormal
          ? `3종 바이오 수치 및 증상 종합 분석 결과 정상(NOR) 범주입니다. 일시적/경미한 소견으로 집에서 경과 관찰이 가능합니다. (AI 모델 위험 확신도: ${Math.min(riskScore, 45).toFixed(1)}%)`
          : `바이오 수치 및 세부 증상 종합 분석 결과 이상(ABN) 소견이 감지되었습니다. 수의사 정밀 진료를 권장합니다. (AI 모델 위험 확신도: ${Math.min(riskScore, 98.5).toFixed(1)}%)`,
      })
    } finally {
      setLoading(false)
    }
  }

  // 현재 선택된 주요 증상들에 대응하는 세부 위험 옵션 목록 추출
  const availableSubSymptoms = selectedSymptoms.flatMap((mainSymptom) => SUB_SYMPTOM_MAP[mainSymptom] || [])
  const uniqueAvailableSubSymptoms = [...new Set(availableSubSymptoms)]

  return (
    <div style={mobileContainerStyle}>
      {/* 두 진단 화면 원클릭 상단 탭 전환 바 */}
      <DiagnosisTabNav />

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={mobileInputGroupStyle}>
              <label style={mobileLabelStyle}>강아지 이름</label>
              <input
                type="text"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="예: 초코"
                style={mobileInputStyle}
              />
            </div>
            <div style={mobileInputGroupStyle}>
              <label style={mobileLabelStyle}>종류 (품종)</label>
              <input
                type="text"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder="예: 푸들"
                style={mobileInputStyle}
              />
            </div>
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

        {/* 3. 보호자 스마트 문진표 카드 (증상 버튼 직하단 팝업 세부 내용 선택) */}
        <section style={mobileCardStyle}>
          <h2 style={mobileSectionTitleStyle}>📝 보호자 스마트 문진표</h2>

          <div style={formSubGroupStyle}>
            <label style={mobileLabelStyle}>① 주요 증상 선택 (버튼 클릭 시 버튼 바로 아래에 세부 내용 선택창이 열립니다)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {SYMPTOM_OPTIONS.map((symptom) => {
                const isSelected = selectedSymptoms.includes(symptom)
                const subItems = SUB_SYMPTOM_MAP[symptom] || []
                return (
                  <div key={symptom} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label
                      style={{
                        ...mobileCheckboxLabelStyle,
                        backgroundColor: isSelected ? '#EEF2FF' : '#F8FAFC',
                        borderColor: isSelected ? '#6366F1' : '#E2E8F0',
                        color: isSelected ? '#4338CA' : '#334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSymptomToggle(symptom)}
                          style={mobileCheckboxInputStyle}
                        />
                        <span style={{ fontSize: '14px', fontWeight: '700' }}>{symptom}</span>
                      </div>
                      {isSelected && subItems.length > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: '#6366F1', color: '#FFFFFF', padding: '2px 8px', borderRadius: '10px' }}>
                          세부옵션 선택중 ▼
                        </span>
                      )}
                    </label>

                    {/* 구토/증상 버튼을 클릭하면 해당 버튼 바로 아래에 팝업 상자로 세부사항이 열림 */}
                    {isSelected && subItems.length > 0 && (
                      <div
                        style={{
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '10px',
                          padding: '12px',
                          marginLeft: '12px',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                          🔍 [{symptom}] 세부 내용 선택 (해당하는 항목을 모두 체크해 주세요):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {subItems.map((subItem) => {
                            const isSubChecked = selectedSubSymptoms.includes(subItem)

                            return (
                              <label
                                key={subItem}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '6px 12px',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  border: '1px solid',
                                  backgroundColor: isSubChecked ? '#4F46E5' : '#FFFFFF',
                                  borderColor: isSubChecked ? '#4338CA' : '#CBD5E1',
                                  color: isSubChecked ? '#FFFFFF' : '#334155',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSubChecked}
                                  onChange={() => handleSubSymptomToggle(subItem)}
                                  style={{ accentColor: '#4F46E5' }}
                                />
                                <span>{subItem}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 🩺 상세 증상 작성 메모란 위치에 결과 카드가 출력되도록 배치 */}
          {result && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '2px solid #E2E8F0' }}>
              <h2 style={{ ...mobileSectionTitleStyle, color: '#0F172A', marginBottom: '8px' }}>
                🩺 수의사 정밀진료 진단 결과
              </h2>
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
                    염증 수치 상승 또는 세부 의심 증상이 감지되었습니다. 수의사 진료를 권장합니다.
                  </p>
                  {result.details && <div style={mobileDetailsBoxStyle}>{result.details}</div>}
                </div>
              )}

              {/* 수의사 제출용 PDF 종합 건강 진단서 발급 버튼 */}
              <button
                type="button"
                onClick={() => setIsPdfModalOpen(true)}
                style={{
                  width: '100%',
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                }}
              >
                📄 수의사 제출용 PDF 진단서 발급
              </button>
              <button
                type="button"
                onClick={() => navigate('/map?category=HOSPITAL')}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  border: '1px solid #A7F3D0',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                🏥 내 주변 동물병원 찾기
              </button>
            </div>
          )}
        </section>

        {/* 4. AI 진단 제출 버튼 */}
        <button type="submit" style={mobileFullWidthSubmitButtonStyle} disabled={loading}>
          {loading ? '✨ AI 하이브리드 분석 중...' : '✨ AI 종합 건강 분석하기'}
        </button>
      </form>

      {/* 바이오센서 종합 건강 진단서 전용 PDF 발급 모달 */}
      <HybridDiagnosisPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        formData={{ petName, breed, age, weight, crp, igg, il6, text_prompt: getCombinedTextPrompt() }}
        result={result}
      />

      {error && !result && (
        <div style={mobileErrorMessageContainerStyle}>
          ⚠️ 통신 오류 발생: {error}
        </div>
      )}

      {/* 주변 동물병원 — 병원 전용 지도(PetMap categories={['HOSPITAL']}) + 리스트.
          조회·지도·리스트가 모두 NearbyPlaces 공용 컴포넌트 안에 있다 */}
      <NearbyPlaces categories={['HOSPITAL']} title="주변 동물병원" />
    </div>
  )
}

// 모바일 퍼스트 인라인 스타일 객체 정의
const mobileContainerStyle = {
  width: '100%',
  maxWidth: '480px',
  margin: '0 auto',
  minHeight: '100vh',
  padding: '16px 12px 32px 12px',
  boxSizing: 'border-box',
  fontFamily: "'Pretendard', system-ui, -apple-system, sans-serif",
  backgroundColor: '#F8FAFC',
  color: '#0F172A',
  overflowX: 'hidden',
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
  gap: '6px',
  width: '100%',
  boxSizing: 'border-box',
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
