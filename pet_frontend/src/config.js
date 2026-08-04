// 서버 주소 설정 — 컴포넌트에서 URL을 하드코딩하지 말고 여기서 가져다 쓴다
// 값은 pet_frontend/.env 에서 관리한다

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const PYTHON_URL = import.meta.env.VITE_PYTHON_URL;
