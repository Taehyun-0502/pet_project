/**
 * 메시지 본문의 URL을 클릭 가능한 링크로 바꾼다 (docs/plan-2026-08-13.md F10a).
 *
 * <b>HTML 문자열을 만들지 않는다.</b> 텍스트를 조각내 `문자열 + <a> 엘리먼트` 배열로 돌려주고,
 * React가 문자열 조각을 이스케이프한다. `dangerouslySetInnerHTML`로 바꾸는 순간
 * **채팅 본문이 그대로 XSS 경로**가 된다 — 남이 보낸 문자열을 마크업으로 해석하게 되기 때문이다.
 * 이 저장소에는 그 API 사용처가 0곳이며, 여기서 시작하지 않는다.
 *
 * 저장 형식은 바꾸지 않는다(서버는 지금처럼 평문 content를 주고받는다) — 그래서 **과거 메시지에도
 * 자동으로 적용**되고, 서버·명세 변경이 없다.
 */

// http/https만 매칭한다. javascript:·data: 같은 스킴은 링크로 만들지 않는다 —
// 자동 링크화의 위험은 대부분 스킴에서 오므로, 걸러내는 대신 **아예 대상에 넣지 않는다**.
// 따옴표·꺾쇠는 URL에서 제외해 마크업처럼 보이는 문자열이 링크에 말려들지 않게 한다
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g

/**
 * URL 끝에 붙은 문장부호를 링크에서 떼어낸다.
 * "여기 봐 https://example.com." 의 마침표까지 링크에 들어가면 눌렀을 때 엉뚱한 주소로 간다.
 *
 * 닫는 괄호는 **짝이 맞지 않을 때만** 뗀다 — 위키 주소처럼 URL 안에 괄호가 들어가는 경우가 있어
 * 무조건 떼면 정상 링크가 잘린다.
 *
 * @returns [링크가 될 부분, 뒤에 남겨 텍스트로 붙일 부분]
 */
function splitTrailingPunctuation(url) {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]
    if ('.,;:!?'.includes(ch)) {
      end -= 1
      continue
    }
    if (ch === ')') {
      const head = url.slice(0, end)
      const opens = (head.match(/\(/g) ?? []).length
      const closes = (head.match(/\)/g) ?? []).length
      if (closes > opens) {
        end -= 1
        continue
      }
    }
    break
  }
  return [url.slice(0, end), url.slice(end)]
}

/**
 * @param text 메시지 본문(평문)
 * @returns URL이 없으면 원문 문자열 그대로, 있으면 [문자열|<a>] 배열
 */
export function linkify(text) {
  if (!text) return text

  const nodes = []
  let cursor = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0]
    const start = match.index
    const [href, trailing] = splitTrailingPunctuation(raw)

    if (start > cursor) nodes.push(text.slice(cursor, start))
    if (href) {
      // target="_blank"에는 rel이 반드시 따라와야 한다 — 없으면 열린 페이지가
      // window.opener로 이쪽 탭을 조작할 수 있다
      nodes.push(
        <a key={start} href={href} target="_blank" rel="noopener noreferrer">
          {href}
        </a>,
      )
      if (trailing) nodes.push(trailing)
    } else {
      // 링크로 남길 게 없으면(문장부호만 남는 기이한 입력) 원문 그대로 텍스트로 둔다
      nodes.push(raw)
    }
    cursor = start + raw.length
  }

  if (cursor === 0) return text // URL이 하나도 없으면 배열을 만들 이유가 없다
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}
