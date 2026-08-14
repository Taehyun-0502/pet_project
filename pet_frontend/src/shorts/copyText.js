/**
 * 클립보드에 텍스트를 복사한다. 성공하면 true.
 *
 * navigator.clipboard 하나로 끝내지 않는 이유가 있다 — 그 API는 **보안 컨텍스트에서만**
 * 존재한다(https 또는 localhost). 이 프로젝트는 config.js가 LAN IP 접속을 지원해서
 * 폰으로 `http://192.168.0.18:5173`에 들어오는 경로가 실제로 쓰이는데, 거기서는
 * navigator.clipboard가 undefined다. 즉 개발자 PC에서만 되고 폰에서는 조용히 실패한다.
 *
 * 그래서 execCommand('copy') 폴백을 둔다. 사양에서 폐기된 API지만 비보안 컨텍스트에서
 * 여전히 동작하는 유일한 방법이고, 실패하면 false를 돌려주니 호출한 쪽이 주소를 직접
 * 보여주는 등으로 대응할 수 있다.
 */
export async function copyText(text) {
  // 보안 컨텍스트면 이쪽이 정석이다
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 권한 거부 등 — 아래 폴백으로 내려간다
    }
  }

  // 화면 밖에 임시 textarea를 만들어 선택 → 복사한다.
  // input이 아니라 textarea인 이유: 줄바꿈이 든 텍스트도 그대로 복사된다.
  const area = document.createElement('textarea')
  area.value = text
  // readOnly + 화면 밖 배치 — 모바일 사파리에서 키보드가 올라오거나 화면이 스크롤되는 것을 막는다
  area.readOnly = true
  area.style.position = 'fixed'
  area.style.top = '-9999px'
  area.style.opacity = '0'
  document.body.appendChild(area)

  try {
    area.select()
    // iOS는 select()만으로 선택 범위가 잡히지 않는 경우가 있어 범위를 명시한다
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}
