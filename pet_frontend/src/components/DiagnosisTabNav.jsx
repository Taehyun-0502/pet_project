// [타 슬라이스 시각 수정] 2026-08-26 웜톤 통일(사용자 지시) — 로직 무변경, 담당자 확인 필요
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
  backgroundColor: '#f5e8d5',
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
  backgroundColor: '#ef7d66',
  color: '#FFFFFF',
  boxShadow: '0 2px 6px rgba(239, 125, 102, 0.35)',
}

const activeHybridTabStyle = {
  backgroundColor: '#e2664e',
  color: '#FFFFFF',
  boxShadow: '0 2px 6px rgba(226, 102, 78, 0.35)',
}

const inactiveTabStyle = {
  backgroundColor: 'transparent',
  color: '#9a8d80',
}
