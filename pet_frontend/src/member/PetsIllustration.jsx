/**
 * 로그인·가입(웜톤 인증 화면) 히어로의 푸들+고양이 일러스트.
 *
 * 시안의 실사 사진 자리 — 사진 자원 없이 배포에 안전하도록 인라인 SVG로 그렸다
 * (외부 이미지 URL 의존 없음). 실제 사진으로 바꿀 때는 이 컴포넌트만 <img>로 교체하면 된다.
 * 장식 요소라 aria-hidden. 색은 부모(.login)의 웜톤 팔레트와 맞춘 값이다.
 */
export default function PetsIllustration(props) {
  return (
    <svg viewBox="0 0 230 160" fill="none" aria-hidden="true" {...props}>
      {/* 바닥 그림자 */}
      <ellipse cx="118" cy="151" rx="100" ry="9" fill="rgba(90, 60, 30, 0.10)" />

      {/* ── 푸들 (좌) ── */}
      <ellipse cx="72" cy="112" rx="38" ry="34" fill="#E9BE93" />
      <rect x="52" y="118" width="12" height="32" rx="6" fill="#E2B285" />
      <rect x="76" y="118" width="12" height="32" rx="6" fill="#EFC69B" />
      <circle cx="70" cy="104" r="16" fill="#F2CFA9" />
      {/* 귀 */}
      <ellipse cx="42" cy="66" rx="13" ry="22" fill="#DFAA78" transform="rotate(14 42 66)" />
      <ellipse cx="102" cy="66" rx="13" ry="22" fill="#DFAA78" transform="rotate(-14 102 66)" />
      {/* 곱슬 머리 뭉치 */}
      <circle cx="72" cy="34" r="15" fill="#EFC69B" />
      <circle cx="56" cy="42" r="14" fill="#EFC69B" />
      <circle cx="88" cy="42" r="14" fill="#EFC69B" />
      <circle cx="48" cy="56" r="12" fill="#EFC69B" />
      <circle cx="96" cy="56" r="12" fill="#EFC69B" />
      {/* 얼굴 */}
      <ellipse cx="72" cy="62" rx="24" ry="21" fill="#F6D9B4" />
      <circle cx="63" cy="59" r="3" fill="#4A3428" />
      <circle cx="81" cy="59" r="3" fill="#4A3428" />
      <circle cx="64" cy="58" r="1" fill="#fff" />
      <circle cx="82" cy="58" r="1" fill="#fff" />
      <ellipse cx="72" cy="71" rx="10" ry="8" fill="#FBEBD3" />
      <ellipse cx="72" cy="68" rx="4.5" ry="3.5" fill="#4A3428" />
      <path d="M72 71 v3" stroke="#4A3428" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M72 74 q-3.5 3 -6 1 M72 74 q3.5 3 6 1"
        stroke="#4A3428" strokeWidth="1.6" strokeLinecap="round"
      />
      <ellipse cx="72" cy="79" rx="3.4" ry="4" fill="#F49AA0" />

      {/* ── 고양이 (우) ── */}
      <path
        d="M196 128 q22 -6 18 -28"
        stroke="#DDA96F" strokeWidth="9" strokeLinecap="round"
      />
      <ellipse cx="158" cy="116" rx="34" ry="30" fill="#FDFBF7" />
      <path d="M168 92 q26 8 20 34 q-2 8 -10 12 q6 -26 -14 -42z" fill="#DDA96F" opacity="0.9" />
      {/* 귀 */}
      <path d="M138 56 L133 34 L152 48 Z" fill="#DDA96F" />
      <path d="M178 56 L183 34 L164 48 Z" fill="#DDA96F" />
      <path d="M139 52 L136 40 L148 48 Z" fill="#F5B8B0" />
      <path d="M177 52 L180 40 L168 48 Z" fill="#F5B8B0" />
      {/* 머리 */}
      <circle cx="158" cy="72" r="22" fill="#FDFBF7" />
      <path
        d="M150 52 q2 8 0 12 M158 50 q1 9 0 14 M166 52 q-2 8 0 12"
        stroke="#DDA96F" strokeWidth="3.4" strokeLinecap="round"
      />
      {/* 눈·코·입 */}
      <circle cx="149" cy="72" r="3" fill="#4A3428" />
      <circle cx="167" cy="72" r="3" fill="#4A3428" />
      <circle cx="150" cy="71" r="1" fill="#fff" />
      <circle cx="168" cy="71" r="1" fill="#fff" />
      <path d="M156 79 h4 l-2 3 z" fill="#E98A80" />
      <path
        d="M158 82 q0 3 -3 3 M158 82 q0 3 3 3"
        stroke="#4A3428" strokeWidth="1.4" strokeLinecap="round"
      />
      {/* 수염 */}
      <path
        d="M136 76 h-10 M137 81 q-8 2 -10 4 M180 76 h10 M179 81 q8 2 10 4"
        stroke="#C9BCA9" strokeWidth="1.3" strokeLinecap="round"
      />
      {/* 앞발 */}
      <ellipse cx="146" cy="140" rx="9" ry="6" fill="#FDFBF7" />
      <ellipse cx="168" cy="140" rx="9" ry="6" fill="#FDFBF7" />

      {/* 하트 데코 */}
      <path
        d="M206 52 a5 5 0 0 1 7 7 l-7 7 -7 -7 a5 5 0 0 1 7 -7z"
        fill="#F6B2A0" opacity="0.85"
      />
      <path
        d="M118 22 a3.4 3.4 0 0 1 4.8 4.8 l-4.8 4.8 -4.8 -4.8 a3.4 3.4 0 0 1 4.8 -4.8z"
        fill="#F3C7B4" opacity="0.8"
      />
    </svg>
  )
}
