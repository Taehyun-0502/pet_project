// 카카오맵 JS SDK를 1회만 로드하고 재사용하기 위한 헬퍼.
// PetMap이 여러 화면(지도 메뉴, 이후 챗봇 답변 미니 지도 등)에서 마운트되어도
// <script> 태그가 중복 삽입되지 않도록 모듈 스코프에 로딩 Promise를 캐싱한다.
// autoload=false로 불러온 뒤 kakao.maps.load(callback)로 실제 지도 모듈 초기화를 기다린다.

let loadPromise = null;

export function loadKakaoMaps(appKey) {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve(window.kakao);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    script.onerror = () => {
      // 로드 실패 시 다음 시도에서 재시도할 수 있도록 캐시를 비운다 (예: 일시적 네트워크 오류).
      loadPromise = null;
      reject(new Error('카카오맵 SDK 로드에 실패했습니다.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
