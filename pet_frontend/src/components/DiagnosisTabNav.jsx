import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

/**
 * DiagnosisTabNav — 피부 AI 스크리닝과 바이오센서 스마트 문진 간 원클릭 상단 탭 전환 컴포넌트
 */
export default function DiagnosisTabNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const isSkinActive = location.pathname.includes('/skin')
  const isHybridActive = location.pathname.includes('/hybrid')

  return (
    <div style={navContainerStyle}>
      <button
        type="button"
        onClick={() => navigate('/skin/diagnosis')}
        style={{
          ...tabButtonStyle,
          ...(isSkinActive ? activeSkinTabStyle : inactiveTabStyle),
        }}
      >
        📸 피부 AI 스크리닝
      </button>
      <button
        type="button"
        onClick={() => navigate('/hybrid/diagnosis')}
        style={{
          ...tabButtonStyle,
          ...(isHybridActive ? activeHybridTabStyle : inactiveTabStyle),
        }}
      >
        🧪 바이오센서 스마트 문진
      </button>
    </div>
  )
}

const navContainerStyle = {
  display: 'flex',
  backgroundColor: '#F1F5F9',
  borderRadius: '14px',
  padding: '4px',
  marginBottom: '16px',
  gap: '4px',
  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
}

const tabButtonStyle = {
  flex: 1,
  padding: '11px 10px',
  border: 'none',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  textAlign: 'center',
}

const activeSkinTabStyle = {
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
}

const activeHybridTabStyle = {
  backgroundColor: '#059669',
  color: '#FFFFFF',
  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)',
}

const inactiveTabStyle = {
  backgroundColor: 'transparent',
  color: '#64748B',
}
