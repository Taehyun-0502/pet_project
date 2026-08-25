// PWA 필수 서비스 워커 (Service Worker)
const CACHE_NAME = 'harubread-pethealth-v1'

// install 이벤트: 서비스 워커 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// activate 이벤트: 이전 캐시 정돈 및 제어권 획득
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// fetch 이벤트: 기본 네트워크 통신 수행
self.addEventListener('fetch', (event) => {
  // 기본 네트워크 패스스루
})
