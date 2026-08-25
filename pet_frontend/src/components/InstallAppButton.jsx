import React, { useState, useEffect } from 'react'

export default function InstallAppButton() {
  // PWA 설치 프롬프트 이벤트 및 OS 상태
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [isReadyToInstall, setIsReadyToInstall] = useState(false)

  // 브라우저 환경 및 PWA 설치 이벤트 감지 효과
  useEffect(() => {
    // 0. PWA 필수 서비스 워커(Service Worker) 자동 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // 1. 이미 앱(Standalone 모드)으로 실행 중인지 검사
    const inStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    setIsStandalone(inStandalone)

    // 2. iOS 디바이스(iPhone, iPad, iPod) 감지
    const userAgent = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(userAgent)
    setIsIOS(iosDevice)

    // 3. 전역 window 객체에 보관된 프롬프트 수신 확인
    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt)
      setIsReadyToInstall(true)
    }

    // 4. Android/PC용 PWA 설치 프롬프트 이벤트 감지
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      window.deferredPrompt = e
      setDeferredPrompt(e)
      setIsReadyToInstall(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  // 설치 버튼 클릭 핸들러 (Android: 원클릭 팝업 실행 / iOS: 가이드 모달)
  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true)
      return
    }

    const activePrompt = deferredPrompt || window.deferredPrompt

    if (activePrompt) {
      try {
        await activePrompt.prompt()
        const { outcome } = await activePrompt.userChoice
        if (outcome === 'accepted') {
          setDeferredPrompt(null)
          window.deferredPrompt = null
          setIsReadyToInstall(false)
        }
      } catch (err) {
        setShowIOSGuide(true)
      }
    } else {
      setShowIOSGuide(true)
    }
  }

  // 이미 독립 앱 형태로 켜져 있는 경우 설치 버튼 숨김
  if (isStandalone) return null

  return (
    <>
      {/* 스마트 앱으로 만들기 설치 버튼 */}
      <button
        type="button"
        onClick={handleInstallClick}
        style={{
          ...installButtonStyle,
          backgroundColor: isReadyToInstall ? '#4F46E5' : '#EEF2FF',
          color: isReadyToInstall ? '#FFFFFF' : '#4F46E5',
          borderColor: isReadyToInstall ? '#4F46E5' : '#C7D2FE',
        }}
        title="홈 화면에 앱으로 추가하여 편리하게 이용하세요"
      >
        <span style={{ fontSize: '16px' }}>📱</span>
        <span>{isReadyToInstall ? '원클릭 앱 설치' : '앱으로 만들기'}</span>
      </button>

      {/* iOS Safari 및 일반 가이드 모달 팝업 */}
      {showIOSGuide && (
        <div style={modalOverlayStyle} onClick={() => setShowIOSGuide(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={modalTitleStyle}>📱 홈 화면에 앱으로 추가하기</h3>
              <button type="button" onClick={() => setShowIOSGuide(false)} style={closeButtonStyle}>
                ✕
              </button>
            </div>

            <div style={guideContentStyle}>
              {isIOS ? (
                <>
                  <p style={guideDescStyle}>
                    아이폰(Safari)에서는 아래 단계로 3초 만에 앱을 설치할 수 있습니다:
                  </p>
                  <ol style={guideListStyle}>
                    <li style={guideListItemStyle}>
                      Safari 하단 중앙의 <strong>[공유 버튼 📤]</strong>을 누르세요.
                    </li>
                    <li style={guideListItemStyle}>
                      메뉴를 내려 <strong>[홈 화면에 추가 ➕]</strong>를 선택하세요.
                    </li>
                    <li style={guideListItemStyle}>
                      우측 상단의 <strong>[추가]</strong>를 누르면 설치가 완료됩니다.
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p style={guideDescStyle}>
                    브라우저 메뉴(⋮)에서 <strong>[앱 설치]</strong> 또는 <strong>[홈 화면에 추가]</strong>를 선택해 주세요.
                  </p>
                </>
              )}
            </div>

            <button type="button" onClick={() => setShowIOSGuide(false)} style={confirmButtonStyle}>
              확인
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// 인라인 스타일 객체 정의
const installButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  border: '1px solid',
  borderRadius: '20px',
  fontSize: '13px',
  fontWeight: '700',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.15)',
  transition: 'all 0.2s ease',
}

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: '20px',
}

const modalCardStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: '20px',
  width: '100%',
  maxWidth: '400px',
  padding: '24px',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
}

const modalHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}

const modalTitleStyle = {
  fontSize: '17px',
  fontWeight: '700',
  color: '#111827',
  margin: 0,
}

const closeButtonStyle = {
  backgroundColor: 'transparent',
  border: 'none',
  fontSize: '18px',
  color: '#9CA3AF',
  cursor: 'pointer',
}

const guideContentStyle = {
  marginBottom: '20px',
}

const guideDescStyle = {
  fontSize: '14px',
  color: '#374151',
  marginBottom: '12px',
  lineHeight: '1.5',
}

const guideListStyle = {
  margin: 0,
  paddingLeft: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const guideListItemStyle = {
  fontSize: '13.5px',
  color: '#4B5563',
  lineHeight: '1.5',
}

const confirmButtonStyle = {
  width: '100%',
  padding: '12px',
  backgroundColor: '#4F46E5',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '10px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
}
