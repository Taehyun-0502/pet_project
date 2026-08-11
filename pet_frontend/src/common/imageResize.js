// 프로필 이미지 업로드 전 축소 (docs/api-spec.md 1·2절).
// 원본(휴대폰 사진 수 MB)이 그대로 저장되면 아바타·썸네일을 그릴 때마다 그 크기를 내려받는다 —
// 표시 최대가 96px 원형이라 512px이면 충분하고, 저장 시 1회 축소가 조회 시마다 내려받는 비용을 없앤다.
// 조회 시 변환(Supabase 이미지 변환)은 Pro 플랜 전용이라 쓰지 않는다.

const MAX_DIMENSION = 512
const QUALITY = 0.85 // jpeg·webp 품질. png는 무손실이라 무시된다

export async function resizeImage(file) {
  // 디코딩 실패(손상 파일 등)면 원본을 그대로 보낸다 — 최종 방어는 서버 검증
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) return file

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  if (scale === 1) {
    bitmap.close()
    return file // 이미 충분히 작다 — 재인코딩으로 품질만 깎을 이유가 없다
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, QUALITY))
  if (!blob) return file
  // blob.type 기준 — 브라우저가 원본 형식을 지원하지 않으면 png로 떨어지는데, png도 서버 허용 목록에 있다
  return new File([blob], file.name, { type: blob.type })
}
