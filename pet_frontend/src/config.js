// 서버 주소 설정 — 컴포넌트에서 URL을 하드코딩하지 말고 여기서 가져다 쓴다
// 값은 pet_frontend/.env 에서 관리한다

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const PYTHON_URL = import.meta.env.VITE_PYTHON_URL;

// 카카오 OAuth REST API 키 (인가 URL용 — 공개 값이라 프론트 노출 무해, api-spec.md 1절 4차)
export const KAKAO_CLIENT_ID = import.meta.env.VITE_KAKAO_CLIENT_ID;
