// 프로필 이미지 업로드 전처리 — 회원·반려동물 화면이 함께 쓴다 (docs/api-spec.md 1·2절).
// 같은 검증·리사이즈가 화면마다 복붙되어 규칙이 갈라지던 것을 한 곳으로 모았다 (2026-08-11).

import { resizeImage } from './imageResize'

// file input의 accept 속성 — 서버 허용 목록과 같은 값 (ImageStorageClient.validateImage)
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 서버 상한과 동일
// 리사이즈 전 상한 — 디코딩 비용이 과한 파일만 거른다. 실제 5MB 판정은 축소 뒤에 한다
const MAX_SOURCE_BYTES = 30 * 1024 * 1024

/**
 * 업로드할 파일을 준비한다: 형식 검사 → 512px 축소 → 용량 검사. 문제가 있으면 Error를 던진다.
 *
 * **순서가 핵심이다** (백로그 83번): 용량 검사를 축소 앞에 두면 휴대폰 원본 사진(보통 5~10MB)이
 * 축소되면 수십 KB가 되는데도 "5MB 이하여야 합니다"로 거부된다 — 실제로 그 상태였다.
 * 그래서 축소를 먼저 하고, 축소 후에도 큰 경우에만 거부한다.
 */
export async function prepareImage(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('jpeg·png·webp 이미지만 업로드할 수 있습니다.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('이미지가 너무 큽니다. 30MB 이하 파일을 선택해 주세요.')
  }
  // 512px 이하이거나 디코딩에 실패하면 원본이 그대로 돌아온다 (imageResize.js)
  const resized = await resizeImage(file)
  if (resized.size > MAX_BYTES) {
    throw new Error('이미지는 5MB 이하여야 합니다.')
  }
  return resized
}
