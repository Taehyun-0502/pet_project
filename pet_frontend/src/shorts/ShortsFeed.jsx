// ShortsFeed.jsx
// 숏츠(릴스) 피드 — GET /api/shorts 로 DB의 영상 목록을 받아 세로 스크롤로 보여준다.
// 좋아요·댓글은 서버에 반영된다 (4단계).
//
// 응답 항목 필드:
//   { id, memberName, videoUrl, thumbnailUrl, caption, durationSec,
//     viewCount, likeCount, commentCount, createdAt, likedByMe }

import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getAds } from "../ad/adApi";
import { useAuth } from "../member/AuthContext";
import CommentSheet from "./CommentSheet";
import DeleteSheet from "./DeleteSheet";
import ReportSheet from "./ReportSheet";
import { copyText } from "./copyText";
import { cropMediaStyle, cropPanStyle } from "./cropFrame";
import MarqueeText from "./MarqueeText";
import { findTrack } from "./musicCatalog";
import { getShort, getShortsFeed, sendShortsEvent, toggleShortLike } from "./shortsApi";
import "./ShortsFeed.css";

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "천" : "" + n);

/* ─────────────────────────────────────────────────────────────
 * 시청 기록 (숏츠_추천알고리즘_구현가이드.md 2절 ② · 3-3절 · 3-4절 · 8절)
 *
 * 추천 알고리즘의 1등 신호는 좋아요가 아니라 시청시간/완료율이다 — 사람들은 좋아요를 잘
 * 누르지 않지만 재밌으면 끝까지 본다. 그 완료율을 만들 재료를 여기서 모은다.
 *
 * 완료율 = watchMs / (durationSec*1000) 이고, 영상이 loop이라 머무는 동안 계속 쌓여
 * 1을 넘을 수 있다 (예: 1.8 = 거의 두 번 봄). 그래서 재시청을 별도 신호로 만들지 않고
 * 완료율 하나로 흡수한다 (가이드 3-3절). 점수는 서버 SQL이 ln(1+완료율)×6으로 계산한다.
 * ───────────────────────────────────────────────────────────── */

// 이 비율보다 빨리 넘기면 skip(감점 신호)으로 본다 (가이드 3-2절 · 3-4절 ①)
const SKIP_RATIO = 0.2;
/*
 * 이보다 짧게 스친 카드는 아무 기록도 남기지 않는다.
 *
 * skip은 "봤는데 재미없어서 넘겼다"는 뜻이어야 한다. 그런데 빠르게 튕기듯 스크롤하면
 * 중간 카드들이 0.1초씩 50% 선을 스쳐 지나가고, 그것까지 skip으로 세면 사용자가 존재조차
 * 모르는 영상에 감점이 쌓인다. 개발 모드(StrictMode)의 마운트→언마운트→재마운트에서
 * 나오는 길이 0짜리 기록도 함께 걸러진다.
 *
 * 결과적으로 3단이 된다 — 300ms 미만은 무기록 / 300ms~완료율 20%는 skip / 그 이상은 watch.
 */
const MIN_WATCH_MS = 300;
// 이만큼 쌓이면 바로 보낸다. 카드마다 즉시 보내면 스크롤 중 요청이 계속 나간다 (가이드 8절 배치)
const BATCH_SIZE = 5;
// 조용해지면 이 시간 뒤에 남은 것을 보낸다 — 한 영상만 오래 보는 경우에도 기록이 남게
const FLUSH_DELAY_MS = 4000;
// 끝에서 이만큼 남았을 때 다음 페이지를 미리 받는다 (마지막 카드에서 받으면 이미 늦다)
const PREFETCH_BEFORE_END = 3;
// 탭했을 때 가운데 정지·재생 표시가 떠 있는 시간.
// ShortsFeed.css의 .sf-tap-hint 애니메이션 길이(.6s)와 같아야 한다 — 이 값이 더 짧으면
// 사라지는 중에 DOM에서 빠져 뚝 끊기고, 더 길면 다 사라진 빈 요소가 남는다
const TAP_HINT_MS = 600;

/* ─────────────────────────────────────────────────────────────
 * 피드 사이 광고 (광고배너_구현가이드.md 4절 "숏츠 피드 사이 삽입")
 *
 * 영상 ADS_EVERY개마다 광고 카드 한 장을 목록에 끼워 넣는다 — 인스타·틱톡과 같은 방식이다.
 * 하단 고정 배너와 달리 영상을 가리지 않고, 넘기면 지나가므로 몰입을 덜 깬다.
 *
 * 끼워 넣기만 하고 **영상 목록(shorts)에는 손대지 않는다.** 광고를 목록 배열에 섞어 넣으면
 * 카드에 넘기는 index가 영상의 순서와 어긋나 다음 페이지 선반입(handleCardEnter)과
 * 제외 목록(excludeIds)이 함께 틀어진다. 그래서 그리는 순간에만 사이에 낀다.
 * ───────────────────────────────────────────────────────────── */
const ADS_EVERY = 5;
// 이 위치에 붙은 광고 + 위치를 지정하지 않은 전역 광고가 후보가 된다 (AdvertisementRepository 주석)
const AD_PLACEMENT = "shorts_feed";

/**
 * 광고 순서를 한 번 섞어 돌려쓸 목록을 만든다 (Fisher-Yates).
 *
 * 자리마다 새로 뽑지 않고 **섞은 순서를 순회**하는 이유가 둘이다 —
 * ① 같은 광고가 연달아 나오지 않고 등록된 광고가 골고루 노출된다(자리마다 뽑으면
 *    바로 다음 자리에 같은 광고가 또 걸릴 수 있다),
 * ② 자리와 광고의 짝이 고정된다. 좋아요 하나만 눌러도 피드가 다시 그려지는데,
 *    그릴 때마다 뽑으면 지금 보고 있는 광고가 눈앞에서 바뀐다.
 */
const shuffled = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// 영상이 로드되기 전에 보이는 배경. DB에 없는 순수 표시용 값이라 id로 색만 골라 쓴다
const FALLBACK_BG = [
  "linear-gradient(135deg,#ff9a56,#ff6a88)",
  "linear-gradient(135deg,#6a5acd,#48c6ef)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#30cfd0,#330867)",
];
const bgOf = (id) => FALLBACK_BG[id % FALLBACK_BG.length];

// 만들기 진입점. 카드는 한 장이 화면을 꽉 채우므로 카드마다 하나씩 두면
// 지금 보이는 화면에 항상 떠 있는 것처럼 보인다 (빈 목록 화면에도 필요).
// 4페이지 제작 플로우(/shorts/create)로 보낸다 — 기존 한 화면 폼은 /shorts/new에 남아 있다
const UploadButton = () => (
  <Link className="sf-upload" to="/shorts/create" aria-label="숏츠 만들기" onClick={(e) => e.stopPropagation()}>
    +
  </Link>
);

/* ───────── 아이콘 ───────── */
const Heart = ({ filled }) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="#fff" strokeWidth="2">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);
const Comment = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5A8.4 8.4 0 0 1 12.5 20a8.6 8.6 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" /></svg>
);
const Share = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
);
// 탭 표시용 — 액션 버튼 아이콘들과 달리 채워진 모양이다. 어두운 원 위에 얹혀
// 한순간만 보이므로 선보다 면이 알아보기 쉽다
const PauseMark = () => (
  <svg viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
);
const PlayMark = () => (
  <svg viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5 19 12 7 19.5z" /></svg>
);
const Sound = ({ muted }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />}
  </svg>
);
// 신고 메뉴를 여는 햄버거. 업로드(+)와 같은 원형 버튼 안에 들어가므로 선 3개만 그린다
const Hamburger = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
// 내 영상일 때 햄버거 자리에 뜨는 휴지통
const Trash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
// 곡 정보 앞에 붙는 음표
const Note = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
    <path d="M9 18V5l10-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </svg>
);

/* ───────── 영상 카드 하나 ───────── */
function ShortCard({ data, index, muted, onToggleMute, onChange, onEvent, onEnter, onRemove }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  // 배경음악. 업로더가 고른 곡을 카탈로그에서 찾는다 — 곡을 안 골랐거나(musicKey=null)
  // 카탈로그에서 빠진 키면 null이고, 그 경우 오디오 요소와 곡 표시를 함께 건너뛴다
  const track = findTrack(data.musicKey);
  const audioRef = useRef(null);
  // 지금 이 카드가 화면에 있는지. 탭에 돌아왔을 때 시계를 다시 돌릴지 판단하는 데 쓴다.
  // state가 아니라 ref인 이유 — 화면에 그릴 값이 아니라서 리렌더가 필요 없다
  const visibleRef = useRef(false);
  // 이번 시청 묶음에서 지금까지 쌓인 시간(ms). loop이므로 영상 길이를 넘어 계속 커진다
  const watchedMsRef = useRef(0);
  // 지금 돌고 있는 구간의 시작 시각.
  // null이면 시계가 멈춘 상태 — 화면 밖이거나, 탭이 숨겨졌거나, 정지 중 (syncClock 참고)
  const runningSinceRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [actionError, setActionError] = useState("");
  // 공유 결과 안내. 성공/실패 모두 이 자리에 잠깐 띄운다
  const [shareNotice, setShareNotice] = useState("");

  /*
   * 내 영상인지. memberId로 비교한다 — memberName은 동명이인이면 남의 영상에 삭제 버튼이 뜬다.
   * 서버가 삭제 시 소유자를 다시 확인하므로 실제로 지워지지는 않지만, 눌러도 404가 나는
   * 버튼을 보여줄 이유가 없다.
   *
   * 피드는 내가 올린 영상을 빼고 보여주므로(랭킹 쿼리) 이 값이 true가 되는 경우는 사실상
   * 둘이다 — 업로드 직후 맨 앞에 끼워 넣은 카드, 그리고 자기 영상 공유 링크로 들어온 경우.
   */
  const isMine = user != null && data.memberId != null && user.id === data.memberId;

  /*
   * 시청 시계. 아래 관찰자 effect와 handleTap 양쪽에서 써야 해서 effect 밖에 둔다.
   * 셋 다 ref만 건드리므로 useCallback([])으로 고정된다 — 이 함수들이 effect 의존성에
   * 들어가는데 정체성이 바뀌면 관찰자가 다시 만들어져 재생이 끊긴다 (onEvent와 같은 이유)
   */
  // 시계를 멈추고 그동안 흐른 시간을 누적한다. 여러 번 불려도 안전하다
  const pauseClock = useCallback(() => {
    if (runningSinceRef.current === null) return;
    watchedMsRef.current += performance.now() - runningSinceRef.current;
    runningSinceRef.current = null;
  }, []);
  const startClock = useCallback(() => {
    if (runningSinceRef.current !== null) return;
    runningSinceRef.current = performance.now();
  }, []);

  /*
   * 시계가 돌아야 하는지 다시 판단한다.
   *
   * 조건이 셋(화면 안 · 탭이 보임 · 재생 중)이라 각 자리에서 start/pause를 직접 부르면
   * 조합을 놓친다 — 예를 들어 정지해둔 채 탭을 나갔다 돌아오면 "화면 안"만 보고 시계를
   * 다시 돌리게 된다. 그래서 부르는 쪽은 "뭔가 바뀌었다"만 알리고 판단은 여기 한 곳에서 한다.
   *
   * 정지 중에도 시간이 쌓이면 영상을 세워두는 것만으로 완료율이 올라가 추천 점수가
   * 부풀려진다 (가이드 3-3절의 완료율은 '본' 시간이어야 한다).
   */
  const syncClock = useCallback(() => {
    const v = videoRef.current;
    const playing = visibleRef.current && document.visibilityState === "visible" && v != null && !v.paused;
    if (playing) startClock();
    else pauseClock();
  }, [pauseClock, startClock]);

  /*
   * 배경음악을 영상 재생 상태에 맞춘다.
   *
   * 재생 여부를 여기서 따로 판단하지 않고 **영상을 따라가게** 한 것이 핵심이다. 재생이 바뀌는
   * 길이 여럿이라(관찰자의 자동 재생·정지, 탭 전환, 사용자 탭, 자동재생 차단) 각자 오디오를
   * 건드리면 반드시 어긋난다. 영상 하나를 진실의 원천으로 두면 아래 play/pause 리스너만으로
   * 모든 경로가 덮인다 — syncClock을 한 곳에 모은 것과 같은 이유다.
   *
   * play()가 거부돼도 무시한다. 브라우저 자동재생 정책상 muted가 아니면 사용자 조작 없이
   * 재생할 수 없는데, 피드는 muted=true로 시작하므로 첫 재생은 통과하고, 음소거를 푸는 것은
   * 사용자 조작(버튼 탭)이라 그때도 통과한다.
   */
  /*
   * 업로더가 고른 구간의 시작점(초). 영상 길이만큼이 구간이므로 끝은 start + 영상 길이다.
   * 컴포넌트가 사는 동안 바뀌지 않으므로 effect 의존성에 넣지 않는다 (id·durationSec과 같다).
   */
  const musicStart = data.musicStartSec ?? 0;

  /*
   * 재생 구간. 업로더가 ② 길이/비율 화면에서 고른 값이다.
   *
   * **영상 파일은 잘려 있지 않다** — 원본이 통째로 올라오고 여기서 그 구간만 돈다
   * (가이드 4절 방법 A, 음악 트리밍과 같은 방식). trimEndSec이 null이면 원본 끝까지이고,
   * 칼럼이 생기기 전에 올라간 영상이 전부 그 경우다.
   */
  const trimStart = data.trimStartSec ?? 0;
  const trimEnd = data.trimEndSec ?? null;

  /*
   * 9:16 프레임 안 위치. null이면 지금까지와 똑같이 가운데 cover다.
   *
   * 영상의 원래 크기를 알아야 계산이 되는데(cropFrame.js) 그것은 메타데이터가 와야 안다.
   * crop이 없는 영상에서는 state를 채우지 않는다 — 대부분의 카드가 그렇고, 쓰지도 않을 값
   * 때문에 리렌더를 한 번 더 할 이유가 없다.
   */
  const crop = data.crop ?? null;
  const [videoSize, setVideoSize] = useState(null);

  /*
   * 업로더가 정한 두 볼륨 (0~100). 칼럼이 생기기 전 영상은 서버가 100으로 채워 내려보내므로
   * "값이 없으면" 분기가 필요 없다 — 그래도 ??를 두는 것은 캐시된 옛 응답을 위해서다.
   *
   * muteOriginal과 videoVolume은 **둘 다** 봐야 한다. 새 영상은 서버가 둘을 맞춰 저장하지만,
   * 칼럼이 생기기 전에 음소거로 올라간 영상은 muteOriginal만 true이고 볼륨은 기본 100이다.
   */
  const musicVolume = (data.musicVolume ?? 100) / 100;
  const videoVolume = (data.videoVolume ?? 100) / 100;

  /*
   * 볼륨은 요소의 프로퍼티라 JSX 속성으로 줄 수 없다. 요소가 만들어진 뒤 대입해야 하는데,
   * onLoadedMetadata만으로는 부족하다 — 그 이벤트는 소스가 바뀌지 않으면 다시 오지 않으므로
   * 값이 나중에 바뀌는 경로(응답 갱신)에서 반영되지 않는다.
   */
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = videoVolume;
    if (audioRef.current) audioRef.current.volume = musicVolume;
  }, [videoVolume, musicVolume]);

  const syncAudio = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (v == null || a == null) return;
    if (v.paused) a.pause();
    else a.play().catch(() => {});
  }, []);

  /*
   * 곡을 영상 진행에 맞춘다 — 구간 재생의 핵심이다.
   *
   * audio의 loop 속성을 쓸 수 없는 이유: loop은 **0초로** 되감는다. 업로더가 1분 지점을
   * 골랐는데 영상이 한 바퀴 돌면 그 뒤로는 곡 맨 앞이 나가버린다.
   *
   * 그래서 영상의 재생 위치를 기준으로 삼는다 — 목표 위치는 항상 `시작점 + 영상 위치`다.
   * 영상이 loop으로 0으로 돌아가면 목표도 시작점으로 돌아가므로 구간 반복이 공짜로 얻어진다.
   * 사용자가 영상을 정지·재생하거나 탭을 전환해 어긋난 경우도 같은 식으로 복구된다.
   *
   * 매 timeupdate마다 currentTime을 대입하지 않고 오차가 커질 때만 손대는 이유: 대입은
   * 곧 seek이라 소리가 끊긴다. timeupdate는 초당 4~5회 오므로 0.35초는 "한 번 놓쳤다"가
   * 아니라 "정말 어긋났다"에 해당하는 값이다.
   *
   * 곡이 영상보다 짧으면 목표 위치가 곡 끝을 넘는다. 그때는 곡 길이로 나눈 나머지를 쓴다 —
   * 업로드 화면이 안내하는 "부족한 만큼 반복됩니다"가 이 계산이다.
   */
  const RESYNC_TOLERANCE_SEC = 0.35;
  const syncAudioPosition = useCallback(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (v == null || a == null || a.readyState < 1) return;

    // 곡의 시작점은 **구간의 시작**과 맞춘다 — v.currentTime을 그대로 더하면 원본 앞부분을
    // 잘라낸 만큼 곡이 앞서 나간다
    let target = musicStart + Math.max(0, v.currentTime - trimStart);
    if (Number.isFinite(a.duration) && a.duration > 0 && target >= a.duration) {
      // 시작점이 곡 끝을 넘을 만큼 크면(카탈로그 교체 등) 0으로 떨어뜨려 무음이 되지 않게 한다
      target = musicStart < a.duration ? musicStart + ((target - musicStart) % (a.duration - musicStart)) : 0;
    }
    if (Math.abs(a.currentTime - target) > RESYNC_TOLERANCE_SEC) {
      a.currentTime = target;
    }
  }, [musicStart, trimStart]);

  /*
   * 음소거를 켜고 끌 때 곡 재생을 다시 맞춘다.
   *
   * 이게 없으면 이런 일이 생긴다 — 첫 로드 때 audio.play()가 거부되면(브라우저 정책·네트워크)
   * 그 카드에서는 다시 시도할 계기가 없다. 영상은 이미 재생 중이라 play 이벤트도 더 오지 않는다.
   * 그러면 소리 버튼을 눌러도 영원히 음악이 안 들린다.
   *
   * 음소거를 푸는 것은 사용자 조작이라 이 시점의 play()는 자동재생 정책을 통과한다.
   */
  useEffect(() => {
    syncAudio();
  }, [muted, syncAudio]);

  // 화면에 50% 이상 보이면 재생, 벗어나면 정지+처음으로.
  // 같은 관찰자에 시청 기록을 얹는다 — 재생 판정과 시청 판정이 어긋나면 안 되기 때문이다
  //
  // data 객체 전체가 아니라 id·durationSec만 의존성에 두는 이유: 좋아요를 누르면 부모가
  // data를 새 객체로 갈아끼우는데, 그때마다 관찰자를 다시 만들면 재생이 끊기고
  // 머문 시간 계산도 초기화된다. 이 두 값은 카드가 사는 동안 바뀌지 않는다.
  // index도 마찬가지다 — 목록은 뒤에만 붙으므로 한 번 정해진 자리는 변하지 않는다
  const { id, durationSec } = data;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 오디오 요소를 effect 안에서 한 번 붙잡아 둔다. cleanup에서 audioRef.current를 그대로
    // 읽으면 그 시점의 ref가 이미 다른 요소(또는 null)일 수 있다.
    // musicKey는 id·durationSec처럼 카드가 사는 동안 바뀌지 않으므로 한 번 잡아두면 된다
    const audio = audioRef.current;

    // 시청 한 묶음을 마감해 보낸다. 완료율로 watch / skip을 가른다
    const emitWatch = () => {
      pauseClock();
      const watchMs = Math.round(watchedMsRef.current);
      watchedMsRef.current = 0;
      if (watchMs < MIN_WATCH_MS) return; // 스쳐 지나간 카드는 기록하지 않는다

      const durationMs = (durationSec ?? 0) * 1000;
      // 상한을 두지 않는다 — 완료율이 1을 넘는 것이 곧 재시청 신호이기 때문이다.
      // 남용(10초 영상에 10분)은 서버 SQL의 백스톱 least(watch_ms, duration*1000*3)이 막는다
      // (가이드 3-5절 — 프론트를 믿지 않고 최종 방어는 서버가 한다)
      const ratio = durationMs > 0 ? watchMs / durationMs : 1;
      // 길이를 모르면 벌점을 주지 않는다 (skip이 아니라 watch로 본다)
      onEvent(id, ratio < SKIP_RATIO ? "skip" : "watch", watchMs);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          video.play().catch(() => {});
          syncClock();
          // play 이벤트로도 syncAudio가 불리지만 여기서 한 번 더 부른다 —
          // 자동재생이 거부되면 play 이벤트가 아예 발생하지 않아 곡이 시작되지 않는다.
          // syncAudio는 영상의 paused 상태를 보고 판단하므로 두 번 불려도 안전하다
          syncAudio();
          onEvent(id, "view");
          // 끝에 가까워졌는지 부모가 판단한다. view 이벤트와 달리 중복 억제나 로그인 조건이
          // 없어야 해서(비로그인도 스크롤은 한다) 별도 통로로 알린다
          onEnter(index);
        } else {
          video.pause();
          // 0이 아니라 구간 시작으로 되돌린다 — 다시 올라온 카드가 잘라낸 앞부분부터 재생되면 안 된다
          video.currentTime = trimStart;
          // 곡도 구간 시작점으로 되돌린다(0이 아니다 — 업로더가 고른 지점이다).
          // video.pause()가 pause 이벤트를 내보내 syncAudio가 정지까지는 해주지만 재생 위치는
          // 남아, 다시 올라온 카드에서 노래가 구간 중간부터 시작한다
          if (audio) audio.currentTime = musicStart;
          emitWatch();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);

    /*
     * 탭을 숨기거나 영상을 정지하면 시계만 멈춘다 — 보내지는 않는다 (가이드 3-4절 ③).
     *
     * 돌아왔을 때 이어서 세는 이유: 한 번의 시청이 두 건으로 쪼개지면 점수가 오히려 커진다.
     * 시청점수가 ln(1+완료율)로 위로 볼록해서 ln(1.5)+ln(1.5) > ln(2) 이기 때문이다.
     */
    // 페이지가 정말 사라지는 시점. 여기서는 마감해서 보낸다 —
    // 부모의 flush(keepalive)가 이 뒤에 실행돼야 큐에 든 것이 함께 나가는데,
    // 리액트는 자식 effect를 부모보다 먼저 실행하므로 이 리스너가 먼저 등록된다
    const onPageHide = () => emitWatch();

    /*
     * 재생 상태가 바뀔 때마다 시계를 맞춘다.
     *
     * handleTap이 직접 시계를 건드리지 않고 여기로 모으는 이유: 재생 상태를 바꾸는 길이
     * 탭 말고도 여럿이다 — 관찰자의 자동 재생·정지, 자동재생 차단으로 play()가 거부되는 경우,
     * 브라우저가 알아서 멈추는 경우. 어느 길로 바뀌든 이 두 이벤트는 반드시 지나간다
     */
    video.addEventListener("play", syncClock);
    video.addEventListener("pause", syncClock);
    document.addEventListener("visibilitychange", syncClock);
    window.addEventListener("pagehide", onPageHide);

    // 배경음악도 같은 이벤트를 타고 영상 상태를 따라간다 (syncAudio 주석 참고)
    video.addEventListener("play", syncAudio);
    video.addEventListener("pause", syncAudio);
    document.addEventListener("visibilitychange", syncAudio);

    // 관찰자를 끊는 것만으로는 '벗어남' 콜백이 오지 않는다 — 보던 중에 다른 화면으로
    // 이동하면 마지막 시청 기록이 통째로 사라지므로 여기서 직접 남긴다
    return () => {
      observer.disconnect();
      video.removeEventListener("play", syncClock);
      video.removeEventListener("pause", syncClock);
      document.removeEventListener("visibilitychange", syncClock);
      window.removeEventListener("pagehide", onPageHide);

      video.removeEventListener("play", syncAudio);
      video.removeEventListener("pause", syncAudio);
      document.removeEventListener("visibilitychange", syncAudio);
      // 카드가 사라질 때 노래가 계속 흐르지 않게 직접 멈춘다. 요소가 DOM에서 빠지면 대개
      // 함께 멈추지만, 리액트가 요소를 재사용하는 경우(같은 위치의 다른 카드)에는 남는다
      if (audio) audio.pause();

      emitWatch();
    };
    // musicStart도 id·durationSec과 같이 카드가 사는 동안 바뀌지 않는 값이라
    // 의존성에 넣어도 관찰자가 다시 만들어지지 않는다
  }, [id, durationSec, index, musicStart, trimStart, onEvent, onEnter, pauseClock, syncClock, syncAudio]);

  /*
   * 탭 한 번에 정지/재생 + 가운데 표시.
   *
   * 표시를 video의 play/pause 이벤트가 아니라 탭에서 띄우는 이유: 그 이벤트는
   * IntersectionObserver의 자동 재생·정지에서도 나오기 때문에, 스크롤로 카드를 넘길
   * 때마다 표시가 번쩍인다. 사용자가 직접 누른 경우에만 보여야 한다.
   *
   * seq를 key로 쓰는 이유: 정지→재생→정지처럼 왕복하면 type이 되돌아오는데, key가 같으면
   * 리액트가 같은 요소로 보고 애니메이션을 다시 시작하지 않는다. 빠르게 두 번 누를 때도
   * 마찬가지다. 매번 새 번호를 주면 항상 처음부터 다시 뜬다
   */
  const [tapHint, setTapHint] = useState(null);
  const tapHintTimerRef = useRef(null);
  const tapHintSeqRef = useRef(0);
  // 표시가 떠 있는 동안 카드를 벗어나면 타이머만 남는다 — 사라진 요소에 setState하지 않게 정리
  useEffect(() => () => clearTimeout(tapHintTimerRef.current), []);

  const handleTap = () => {
    const v = videoRef.current;
    // play()는 비동기라 그 결과를 기다리면 표시가 늦는다. 누른 순간의 의도로 정한다
    const pausing = !v.paused;
    if (pausing) v.pause();
    else v.play().catch(() => {});

    tapHintSeqRef.current += 1;
    setTapHint({ paused: pausing, seq: tapHintSeqRef.current });
    clearTimeout(tapHintTimerRef.current);
    tapHintTimerRef.current = setTimeout(() => setTapHint(null), TAP_HINT_MS);
  };

  /*
   * 구간 끝이라고 볼 여유(초). timeupdate는 250ms 안팎으로 띄엄띄엄 오기 때문에
   * `>= end`만 보면 매번 조금씩 넘겨 재생한 뒤 되감겨 끝부분이 튄다.
   */
  const TRIM_EPSILON = 0.05;
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;

    /*
     * 구간 반복. <video loop>은 **원본 끝**에서만 되감으므로, 잘라낸 구간이 원본보다 짧으면
     * 그 뒤가 그대로 이어 재생된다. 여기서 직접 되돌려야 한다.
     */
    const end = trimEnd ?? v.duration;
    if (
      Number.isFinite(end) &&
      (v.currentTime >= end - TRIM_EPSILON || v.currentTime < trimStart - 0.3)
    ) {
      v.currentTime = trimStart;
      // 곡도 함께 구간 처음으로. 놔두면 두 번째 재생부터 노래가 어긋난 채 돈다
      const a = audioRef.current;
      if (a) a.currentTime = musicStart;
    }

    // 진행 막대는 **잘린 구간** 기준이다. 원본 길이로 재면 막대가 중간까지만 차고 끝난다
    const span = (Number.isFinite(end) ? end : 0) - trimStart;
    if (span > 0) {
      setProgress(Math.min(100, Math.max(0, ((v.currentTime - trimStart) / span) * 100)));
    }

    // 곡 위치를 여기서 맞춘다 — 영상 진행에 붙여야 하므로 영상의 시계를 그대로 쓰는 것이 맞다
    syncAudioPosition();
  };

  /*
   * 진행 막대 스크럽 — 누르거나 끌면 그 시점부터 재생된다 (유튜브 쇼츠와 같은 동작).
   *
   * 좌표 계산은 **잘린 구간** 기준이다. 막대가 원래 구간 비율로 차오르므로(onTimeUpdate),
   * 되돌릴 때도 같은 기준을 써야 손가락 위치와 실제 시점이 맞는다 — 원본 길이로 계산하면
   * 30초를 잘라낸 8분짜리 영상에서 막대 끝을 눌러도 구간 안 어딘가로 밖에 못 간다.
   *
   * 상태가 아니라 ref로 진행 여부를 판단하는 이유: pointermove가 setScrubbing(true)로 인한
   * 리렌더보다 먼저 올 수 있어, 그때 state를 보면 첫 몇 프레임을 놓친다.
   */
  const progressRef = useRef(null);
  const scrubbingRef = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  // 끌기 전에 재생 중이었는지 — 놓았을 때 그 상태로 되돌린다. 정지 중에 만졌으면 정지를 유지한다
  const wasPlayingRef = useRef(false);

  /** 막대 위 x좌표 → 원본 기준 시각(초). 구간 길이를 모르면 null */
  const scrubTimeAt = (clientX) => {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (v == null || bar == null) return null;

    /*
     * duration이 Infinity인 경우가 있다 — MediaRecorder가 만든 webm에는 길이가 안 적혀 있다
     * (useCameraRecorder 주석 참고). trimEndSec이 있으면 그 값이 쓰이므로 보통은 걸리지 않지만,
     * 둘 다 없으면 비율을 낼 수 없으므로 조용히 아무것도 하지 않는다
     */
    const end = trimEnd ?? v.duration;
    if (!Number.isFinite(end)) return null;
    const span = end - trimStart;
    if (!(span > 0)) return null;

    const rect = bar.getBoundingClientRect();
    if (!(rect.width > 0)) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));

    /*
     * 끝에 정확히 붙이지 않는다. onTimeUpdate의 구간 반복 조건이 `>= end - TRIM_EPSILON`이라
     * 딱 끝으로 옮기면 놓는 즉시 처음으로 튀어 "끝을 눌렀는데 되감겼다"가 된다.
     * 그 여유보다 조금 앞에 세우면 막대는 끝까지 찬 것처럼 보이면서 반복은 정상적으로 돈다
     */
    return Math.min(trimStart + span * ratio, end - TRIM_EPSILON - 0.01);
  };

  const seekToClientX = (clientX) => {
    const v = videoRef.current;
    const t = scrubTimeAt(clientX);
    if (v == null || t == null) return;

    v.currentTime = t;

    // 정지 중에는 timeupdate가 오지 않아 막대와 곡이 따라오지 않는다 — 여기서 직접 맞춘다
    const end = trimEnd ?? v.duration;
    const span = end - trimStart;
    if (span > 0) setProgress(Math.min(100, Math.max(0, ((t - trimStart) / span) * 100)));
    syncAudioPosition();
  };

  const onScrubDown = (e) => {
    const v = videoRef.current;
    if (v == null) return;
    // 카드 전체의 탭(정지/재생)과 겹치지 않게 한다. click은 따로 올라가므로 그쪽도 막는다
    e.stopPropagation();
    // 손가락이 막대를 벗어나도 계속 따라오게 한다 — 없으면 조금만 위로 올려도 끌기가 끊긴다
    e.currentTarget.setPointerCapture?.(e.pointerId);

    wasPlayingRef.current = !v.paused;
    /*
     * 끄는 동안은 멈춘다. 재생을 둔 채로 seek을 연달아 넣으면 브라우저가 앞선 seek을 취소하며
     * 화면과 소리가 튄다. 멈추면 pause 이벤트를 타고 곡도 함께 서고 시청 시계도 멎는다
     * (syncClock·syncAudio 주석 참고) — 끌고 있는 시간은 본 시간이 아니므로 그게 맞다
     */
    v.pause();
    scrubbingRef.current = true;
    setScrubbing(true);
    seekToClientX(e.clientX);
  };

  const onScrubMove = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    seekToClientX(e.clientX);
  };

  // pointerup·pointercancel 양쪽에서 부른다 — 전화가 오는 등으로 취소되면 up이 오지 않는다
  const onScrubEnd = (e) => {
    if (!scrubbingRef.current) return;
    e.stopPropagation();
    scrubbingRef.current = false;
    setScrubbing(false);
    if (wasPlayingRef.current) videoRef.current?.play().catch(() => {});
  };

  /*
   * 공유 — 이 영상으로 바로 열리는 링크를 클립보드에 복사한다.
   *
   * `?v={id}`를 붙이는 이유: /shorts만 복사하면 링크를 받은 사람이 자기 피드를 보게 되어
   * 공유가 아무 의미가 없다. 피드가 이 파라미터를 읽어 해당 영상을 맨 앞에 놓는다.
   * 단건 조회는 공개 경로라 링크를 받은 사람이 로그인하지 않아도 열린다.
   *
   * 복사가 실패할 수 있어(비보안 컨텍스트 등 — copyText 주석 참고) 그때는 주소를 그대로
   * 보여준다. "복사 실패"만 알리면 사용자가 할 수 있는 일이 없다.
   */
  const shareNoticeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(shareNoticeTimerRef.current), []);

  const onShare = async () => {
    const link = `${window.location.origin}/shorts?v=${data.id}`;
    const copied = await copyText(link);
    setShareNotice(copied ? "링크를 복사했습니다." : link);
    clearTimeout(shareNoticeTimerRef.current);
    // 복사 실패로 주소를 보여주는 경우는 읽고 손으로 옮길 시간이 필요해 더 길게 둔다
    shareNoticeTimerRef.current = setTimeout(() => setShareNotice(""), copied ? 1800 : 8000);
  };

  // 좋아요는 서버가 최종 상태와 개수를 알려주므로 화면에서 미리 더하지 않는다.
  // 미리 더하면 다른 사람이 누른 수와 어긋난다
  const onLike = async () => {
    if (!user) { navigate("/login"); return; }
    if (likePending) return;

    setLikePending(true);
    setActionError("");
    try {
      const res = await toggleShortLike(data.id);
      onChange(data.id, { likedByMe: res.liked, likeCount: res.likeCount });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLikePending(false);
    }
  };

  return (
    <div className="sf-card" onClick={handleTap}>
      <div className="sf-fallback" style={{ background: bgOf(data.id) }}>🐾</div>
      {/*
        loop으로 되돌렸다 (가이드 3-3절). 머무는 동안 시청 시간이 영상 길이를 넘어 쌓이고,
        그 초과분이 곧 '재시청' 신호가 되어 별도 신호를 만들지 않아도 된다.
        자동 넘김(onEnded)과는 양자택일이다 — loop이면 ended 이벤트가 아예 발생하지 않는다.
        인스타·틱톡·쇼츠의 기본 동작도 loop이고 자동 넘김은 별도 옵션이다.
      */}
      {/* 9:16 위치는 cropFrame.js/css가 정한다 — 제작 플로우 ②의 미리보기와 **같은 공식**이어야
          거기서 맞춰 놓은 화면이 여기서 그대로 나온다 */}
      <div className="crop-pan" style={cropPanStyle(crop)}>
      <video
        ref={videoRef}
        className="crop-media"
        style={cropMediaStyle(crop, videoSize)}
        src={data.videoUrl}
        poster={data.thumbnailUrl ?? undefined}
        /* 구간 시작으로 옮겨두지 않으면 첫 재생이 잘라낸 앞부분부터 나간다 */
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          v.currentTime = trimStart;
          // 볼륨은 속성이 아니라 프로퍼티라 JSX로 줄 수 없다 — 요소가 준비되는 즉시 대입한다
          v.volume = videoVolume;
          if (crop && !videoSize) setVideoSize({ width: v.videoWidth, height: v.videoHeight });
        }}
        /*
          두 층의 음소거가 곱해진다. muted는 **보는 사람**이 카드 소리를 끈 것이고,
          data.muteOriginal은 **올린 사람**이 영상 트랙을 죽여둔 것이다 — 후자는 보는 사람이
          소리 버튼을 켜도 되살아나지 않아야 한다(그래서 OR).
          업로더가 원본을 끄고 곡을 골랐으면 소리 버튼은 사실상 BGM 스위치가 된다.
        */
        muted={muted || data.muteOriginal}
        loop
        playsInline
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
      />
      </div>
      {/*
        배경음악. 곡을 고른 영상에만 요소가 생긴다.
        loop인 이유는 영상과 같다 — 영상이 계속 돌므로 노래가 먼저 끝나면 무음 구간이 생긴다.
        재생·정지는 syncAudio가 영상을 따라가게 맞추므로 여기서 제어하지 않는다.
        preload="metadata"로 둔 것은 곡이 늦게 시작하는 것을 줄이면서(none이면 탭한 뒤 받기
        시작한다) 카드마다 수 MB를 미리 받지는 않게 하는 절충이다.
      */}
      {track && (
        <audio
          ref={audioRef}
          src={track.url}
          muted={muted}
          preload="metadata"
          /*
            loop을 쓰지 않는다 — loop은 0초로 되감아 업로더가 고른 구간을 벗어난다.
            구간 반복은 syncAudioPosition이 영상 위치를 기준으로 맞춘다(그 주석 참고).
            메타데이터가 오는 즉시 시작점으로 옮겨둔다 — 그러지 않으면 첫 재생이 0초부터 나간다.
          */
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            /*
             * 곡 길이를 넘는 시작점은 0으로 떨어뜨린다.
             *
             * 서버는 이 값의 상한을 검증하지 못한다 — 곡 길이를 모르기 때문이다(파일은
             * Storage에 있다). 그래서 조작된 요청이나 카탈로그 교체로 범위를 넘은 값이
             * DB에 남을 수 있고, 그대로 대입하면 브라우저가 곡 끝으로 붙여 무음이 된다.
             * 여기서 걸러 최소한 곡 처음부터는 들리게 한다.
             */
            const safe = Number.isFinite(a.duration) && musicStart < a.duration ? musicStart : 0;
            a.currentTime = safe;
            // 볼륨은 프로퍼티라 JSX로 줄 수 없다 (영상 쪽과 같은 이유)
            a.volume = musicVolume;
          }}
        />
      )}
      <div className="sf-scrim" />

      {/*
        업로더가 얹은 글자들(최대 5개). 영상 파일에 굽지 않고 표시 시점에 올린다
        (ShortsOverlayText 주석). 위치는 %로 저장되고 그 좌표가 글자 블록의 중심이다.
        스크림(2) 위, 정보·액션(4) 아래에 두고 탭을 가로채지 않게 한다
      */}
      {/* key에 index를 쓴다 — 목록이 업로드 시점에 고정되고 순서가 바뀌거나 중간이 지워지는
          일이 없어서, 여기서는 index가 안정적인 식별자다 */}
      {(data.overlayTexts ?? []).map((item, i) => (
        <div
          key={i}
          className="sf-overlay-text"
          /* 업로더가 누른 지점이 글자 블록의 중심이다 — CSS의 translate(-50%,-50%)와 짝이다.
             color·size·rotate는 이 필드들이 생기기 전 영상에는 없다 — 그때는 CSS 기본값
             (흰색·1배·0도)이 그대로 쓰이고, 그것이 예전 표시와 같다 */
          style={{
            top: `${item.top}%`,
            left: `${item.left}%`,
            color: item.color || undefined,
            '--ov-size': item.size ?? 1,
            '--ov-rotate': `${item.rotate ?? 0}deg`,
          }}
        >
          {item.text}
        </div>
      ))}
      {/* 화면에 잠깐 뜨는 상태 표시일 뿐이라 스크린리더에는 읽히지 않게 한다 */}
      {tapHint && (
        <div key={tapHint.seq} className="sf-tap-hint" aria-hidden="true">
          {tapHint.paused ? <PauseMark /> : <PlayMark />}
        </div>
      )}
      <UploadButton />
      {/*
        같은 자리에 두 역할이 들어간다 — 내 영상이면 삭제(휴지통), 남의 영상이면 신고(햄버거).
        자기 영상을 신고할 일은 없고(서버도 막을 대상이다) 남의 영상을 지울 수는 없으니
        둘을 나란히 두면 항상 하나는 쓸모없는 버튼이 된다.

        stopPropagation이 필요한 이유는 sf-actions와 같다 — 없으면 카드의 onClick(handleTap)까지
        올라가 영상이 함께 정지된다.
      */}
      <button
        type="button"
        className="sf-more"
        aria-label={isMine ? "이 영상 삭제하기" : "이 영상 신고하기"}
        aria-expanded={isMine ? deleteOpen : reportOpen}
        onClick={(e) => {
          e.stopPropagation();
          // 댓글 시트를 함께 닫는다 — 이 버튼은 댓글 시트(하단 65%)에 가리지 않는 위쪽에 있어서
          // 댓글을 열어둔 채로 누를 수 있고, 그러면 같은 z-index의 시트 둘이 겹쳐 보인다
          setCommentsOpen(false);
          if (isMine) setDeleteOpen(true);
          else setReportOpen(true);
        }}
      >
        {isMine ? <Trash /> : <Hamburger />}
      </button>

      <div className="sf-info">
        <div className="sf-user">
          <span className="sf-avatar">🐾</span>
          <span className="sf-name">@{data.memberName}</span>
        </div>
        <div className="sf-caption">{data.caption}</div>
        {/* 곡 정보는 설명 아래에 붙인다 — 오른쪽 위(업로드·햄버거)와 겹치지 않고, 영상 위를
            덮는 요소를 한쪽에 모아둘 수 있다. 곡을 안 고른 영상에는 아무것도 뜨지 않는다 */}
        {track && (
          <div className="sf-music">
            <Note />
            {/* 잘라내지 않고 흘려 보여준다 — "…"로 끊기면 제목도 아티스트도 알 수 없다 */}
            <MarqueeText className="sf-music-text">
              {track.title}
              {track.artist && <em> · {track.artist}</em>}
            </MarqueeText>
          </div>
        )}
      </div>

      <div className="sf-actions" onClick={(e) => e.stopPropagation()}>
        <button className={data.likedByMe ? "sf-liked" : ""} onClick={onLike} disabled={likePending}>
          <Heart filled={data.likedByMe} /><span>{fmt(data.likeCount)}</span>
        </button>
        <button onClick={() => setCommentsOpen(true)}>
          <Comment /><span>{fmt(data.commentCount)}</span>
        </button>
        <button onClick={onShare}><Share /><span>공유</span></button>
        <button onClick={onToggleMute}><Sound muted={muted} /><span>{muted ? "음소거" : "소리"}</span></button>
      </div>

      {/* 좋아요 실패와 공유 결과가 같은 자리를 쓴다 — 동시에 뜰 일이 없고, 카드 위에 알림 줄을
          여러 개 두면 영상을 덮는 면적만 늘어난다. 복사 실패 시에는 주소가 그대로 들어온다 */}
      {(actionError || shareNotice) && (
        <p className="sf-action-error">{actionError || shareNotice}</p>
      )}

      {/* shortId를 넘기지 않는다 — 지금은 서버로 보내지 않아 쓸 곳이 없다.
          접수 API가 생기면 shortId={data.id}를 다시 넘긴다 */}
      {reportOpen && <ReportSheet onClose={() => setReportOpen(false)} />}

      {deleteOpen && (
        <DeleteSheet
          shortId={data.id}
          onClose={() => setDeleteOpen(false)}
          // 지운 카드는 부모가 목록에서 빼므로 이 컴포넌트가 곧 언마운트된다 —
          // setDeleteOpen(false)를 따로 부르지 않아도 된다
          onDeleted={onRemove}
        />
      )}

      {commentsOpen && (
        <CommentSheet
          shortId={data.id}
          onClose={() => setCommentsOpen(false)}
          // 댓글이 늘면 카드의 댓글 수 표시도 같이 올린다 (피드를 다시 불러오지 않고)
          onCountChange={(delta) =>
            onChange(data.id, { commentCount: data.commentCount + delta })
          }
        />
      )}

      {/*
        진행 막대. 보기만 하는 것이 아니라 눌러서 그 시점으로 옮길 수 있다(onScrubDown 주석).
        onClick을 따로 막는 이유: pointerdown을 막아도 click은 별개 이벤트로 카드까지 올라가
        옮기자마자 정지/재생이 함께 토글된다
      */}
      <div
        ref={progressRef}
        className={"sf-progress" + (scrubbing ? " is-scrubbing" : "")}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubEnd}
        onPointerCancel={onScrubEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <i style={{ width: progress + "%" }} />
      </div>
    </div>
  );
}

/* ───────── 영상 사이에 끼는 광고 카드 ───────── */
function AdCard({ ad }) {
  /*
   * 이미지가 깨지면 카드를 통째로 내린다 (AdBanner와 같은 판단).
   * 영상 사이에 깨진 이미지 한 장이 끼면 광고가 아니라 피드가 고장 난 것처럼 보인다.
   *
   * loading="lazy"라 대개 앞 영상을 보는 동안 실패가 나고, 그때 이 카드는 화면에 없으므로
   * 스크롤이 튀지 않는다.
   */
  const [broken, setBroken] = useState(false);
  if (broken) return null;

  return (
    /* 높이·스냅·overflow는 .sf-card를 그대로 쓴다 — 영상과 같은 "한 장 = 한 화면"이어야
       스크롤 스냅이 광고 카드에서만 어긋나지 않는다 */
    <div className="sf-card sf-ad">
      {/*
        카드 전체가 광고 링크다. 실제 앱들의 전면 광고와 같은 동작이고, 아래 '자세히 보기'는
        그것을 눈에 보이게 하는 표시다 — 넘기는 동작(스와이프)에서는 click이 나지 않으므로
        스크롤 중에 열릴 걱정은 없다.
        z-index 1 — 영상이 놓이는 층과 같다 (.sf-card .crop-pan 참고)
      */}
      <a
        className="sf-ad-link"
        href={ad.linkUrl}
        target="_blank"
        // sponsored — 유료 광고 링크임을 알리는 표준 값 (가이드 참고 메모)
        rel="noopener noreferrer sponsored"
      >
        <img
          src={ad.imageUrl}
          alt={ad.title}
          loading="lazy"
          // 이미지를 끌어 옮기는 기본 동작을 막는다 — 세로로 넘기려던 손짓이 드래그로 먹히면
          // 카드가 넘어가지 않는다
          draggable="false"
          onError={() => setBroken(true)}
        />
      </a>
      {/* 아래 문구가 밝은 광고 이미지 위에서도 읽히게 — 영상 카드와 같은 스크림을 쓴다 */}
      <div className="sf-scrim" />
      {/* 광고임을 알리는 표시 (표시광고법 권장) */}
      <span className="sf-ad-badge">AD</span>
      {/* 광고 카드에서도 만들기 버튼은 남는다 — 카드마다 하나씩 있어야 "항상 떠 있는" 것처럼
          보이는데, 여기서만 빠지면 넘길 때 버튼이 사라졌다 나타난다 (UploadButton 주석) */}
      <UploadButton />
      <div className="sf-ad-info">
        <div className="sf-ad-title">{ad.title}</div>
        <a className="sf-ad-cta" href={ad.linkUrl} target="_blank" rel="noopener noreferrer sponsored">
          자세히 보기
        </a>
        {/* 영상이 아니라 넘어가지 않는 화면이므로 다음으로 가는 길을 알려준다 —
            없으면 광고에서 피드가 끝난 것처럼 보인다 */}
        <p className="sf-ad-hint">위로 넘기면 계속 볼 수 있어요</p>
      </div>
    </div>
  );
}

/* ───────── 피드 전체 ───────── */
export default function ShortsFeed() {
  const { user } = useAuth();
  const location = useLocation();
  const [muted, setMuted] = useState(true); // 모바일 자동재생은 muted 필수
  const [shorts, setShorts] = useState(null); // null = 아직 불러오는 중
  const [error, setError] = useState("");
  // 서버가 "더 있다"고 알려준 값. 다음 페이지를 받을지 판단한다
  const [hasNext, setHasNext] = useState(false);
  /*
   * 사이에 끼울 광고들. 순서를 미리 섞어 두고 광고 자리마다 차례로 꺼내 쓴다 (shuffled 주석).
   *
   * 피드를 여는 동안 한 번만 받는다 — 계약 기간은 분 단위로 바뀌지 않으므로 스크롤 중에
   * 목록이 달라질 일이 없다. 비어 있으면(계약이 없거나 전부 종료) 광고 카드가 아예 끼지 않는다
   */
  const [adRotation, setAdRotation] = useState([]);

  /*
   * 다음 페이지 요청에 필요한 값들을 ref로도 들고 있는 이유:
   * loadMore를 카드의 IntersectionObserver 의존성에 넣기 때문에 그 함수의 정체성이 바뀌면
   * 관찰자가 다시 만들어져 재생이 끊긴다. 그래서 loadMore는 useCallback([])으로 고정하고
   * 최신 값은 ref로 읽는다 (onEvent를 loggedInRef로 처리한 것과 같은 이유).
   */
  const shortsRef = useRef([]);
  const hasNextRef = useRef(false);
  // 요청이 겹치지 않게 하는 잠금. 끝부분 카드 여러 장이 연달아 화면에 들어오면
  // loadMore가 여러 번 불리는데, 그때마다 요청하면 같은 페이지를 중복으로 받는다
  const loadingRef = useRef(false);

  useEffect(() => {
    shortsRef.current = shorts ?? [];
    hasNextRef.current = hasNext;
  }, [shorts, hasNext]);

  // 보낼 차례를 기다리는 이벤트들. state가 아니라 ref인 이유 — 화면에 그릴 값이 아니고,
  // state로 두면 이벤트가 쌓일 때마다 피드 전체가 리렌더되어 재생이 끊긴다
  const queueRef = useRef([]);
  const timerRef = useRef(null);
  // 이번에 피드를 보는 동안 view를 이미 보낸 영상들. 위아래로 스크롤을 반복하면
  // 같은 카드가 계속 화면에 드나드는데, 그때마다 view를 보내면 이력 테이블만 불어난다.
  // view는 '이미 본 영상 제외'(가이드 9절)에만 쓰이므로 한 번이면 충분하다
  const sentViewsRef = useRef(new Set());
  // 로그인 여부를 ref로도 들고 있는 이유: onEvent를 카드의 관찰자 의존성에 넣기 때문에
  // 이 함수의 정체성이 바뀌면 관찰자가 다시 만들어져 재생이 끊긴다. 값만 갱신한다
  const loggedInRef = useRef(false);
  useEffect(() => {
    loggedInRef.current = Boolean(user);
  }, [user]);

  // 모아둔 것을 한꺼번에 보낸다. 실패는 무시한다 — 통계가 화면을 방해해서는 안 된다
  const flushEvents = useCallback((keepalive = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = queueRef.current;
    if (pending.length === 0) return;
    queueRef.current = [];
    pending.forEach((event) =>
      sendShortsEvent(event.shortId, { type: event.type, watchMs: event.watchMs }, { keepalive })
    );
  }, []);

  const handleEvent = useCallback(
    (shortId, type, watchMs = null) => {
      // 이벤트 API는 로그인 전용이다. 비로그인은 큐에 넣지도 않는다 (전부 401이 될 요청)
      if (!loggedInRef.current) return;
      if (type === "view") {
        if (sentViewsRef.current.has(shortId)) return;
        sentViewsRef.current.add(shortId);
      }
      queueRef.current.push({ shortId, type, watchMs });

      if (queueRef.current.length >= BATCH_SIZE) {
        flushEvents();
      } else if (timerRef.current === null) {
        timerRef.current = setTimeout(() => flushEvents(), FLUSH_DELAY_MS);
      }
    },
    [flushEvents]
  );

  // 탭을 숨기거나 페이지를 떠날 때 남은 기록을 보낸다.
  // pagehide까지 듣는 이유: 모바일 사파리는 탭을 닫을 때 visibilitychange가 오지 않는다
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushEvents(true);
    };
    const onPageHide = () => flushEvents(true);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      // 카드들의 정리(마지막 watch 기록)가 먼저 끝난 뒤 이 정리가 돌기 때문에
      // 여기서 비우면 방금 들어온 것까지 함께 나간다
      flushEvents(true);
    };
  }, [flushEvents]);

  useEffect(() => {
    getAds(AD_PLACEMENT)
      .then((ads) => setAdRotation(shuffled(ads)))
      // 광고는 부가 요소다. 못 받아도 피드는 그대로 보여준다 (AdBanner와 같은 판단) —
      // 광고 요청 실패 때문에 영상이 안 나오면 그게 더 큰 문제다
      .catch(() => setAdRotation([]));
  }, []);

  /*
   * 업로드 화면이 실어 보낸 "방금 올린 영상" (ShortsUploadPage의 navigate state).
   *
   * 피드는 내 영상을 빼고 보여주므로 이것이 없으면 올린 결과를 한 번도 못 본다.
   * 목록 맨 앞에 한 번 끼워 넣기 위한 값이다.
   *
   * ref로 붙잡아 두는 이유: 아래에서 히스토리 state를 즉시 비우기 때문에 location.state를
   * 그대로 참조하면 값이 사라진다. 첫 렌더에 읽은 값만 쓰면 되므로 ref가 맞다.
   */
  const justUploadedRef = useRef(location.state?.justUploaded ?? null);

  /*
   * 히스토리에서 그 값을 지운다 — "한 번만" 보이게 하기 위한 것이다.
   *
   * navigate state는 히스토리 항목에 저장되어 새로고침해도 되살아난다. 지우지 않으면
   * 며칠 뒤 같은 탭을 새로고침할 때 예전에 올린 영상이 맨 앞에 다시 뜬다.
   * 이미 ref에 담아뒀으므로 이번 화면에서는 정상적으로 보인다.
   */
  useEffect(() => {
    if (location.state?.justUploaded) {
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  /**
   * 목록 맨 앞에 고정할 항목을 정한다. 없으면 null.
   *
   * 두 경로가 같은 자리를 쓴다 — ① 방금 올린 영상, ② 공유 링크(`/shorts?v=123`)로 들어온 영상.
   * 둘 다 "피드 순위와 무관하게 이 영상을 보여줘야 한다"는 같은 요구라서 한 갈래로 합쳤다.
   *
   * location.search가 아니라 window.location.search를 읽는 이유: 이 effect는 처음 한 번만
   * 돌아야 하는데(deps []) location을 참조하면 반응형 의존성이 되어 규칙이 어긋난다.
   */
  const loadPinned = async () => {
    if (justUploadedRef.current) return justUploadedRef.current;

    const raw = new URLSearchParams(window.location.search).get("v");
    const sharedId = Number(raw);
    if (!raw || !Number.isInteger(sharedId) || sharedId <= 0) return null;

    // 삭제된 영상 링크를 받은 경우 등은 조용히 넘긴다 — 링크가 죽었다고 피드 전체를
    // 에러 화면으로 바꾸면 할 수 있는 일이 없어진다. 아래로 스크롤하면 평소 피드가 나온다
    return getShort(sharedId).catch(() => null);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pinned = await loadPinned();
      try {
        // 첫 페이지. 목록은 이미 점수 순으로 정렬돼 있어 그대로 그리면 된다
        const feed = await getShortsFeed();
        if (cancelled) return;
        // 서버가 내 영상을 빼주므로 업로드 직후 경로에서는 겹칠 일이 없지만, 공유 링크는
        // 남의 영상일 수도 있어 실제로 겹친다 — 걸러내지 않으면 리액트 key가 중복돼 화면이 깨진다
        setShorts(pinned ? [pinned, ...feed.items.filter((s) => s.id !== pinned.id)] : feed.items);
        setHasNext(feed.hasNext);
      } catch (err) {
        if (cancelled) return;
        /*
         * 목록을 못 받아도 고정 항목은 보여준다. 업로드에 성공한 직후 에러 화면만 뜨면
         * 업로드가 실패한 것처럼 읽히고(실제로는 저장까지 끝난 상태다), 공유 링크로 들어온
         * 사람도 정작 보려던 영상을 못 본다.
         */
        if (pinned) setShorts([pinned]);
        else setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 다음 페이지를 이어 받는다 (가이드 9절).
   *
   * 커서가 아니라 <b>지금까지 받은 id를 제외</b>해서 요청한다 — 점수 순서는 id 순서와
   * 무관하므로 "이 id보다 작은 것"이라는 커서가 성립하지 않는다.
   *
   * 실패해도 조용히 넘어간다. 이미 받아 놓은 목록은 그대로 보여주는 것이 낫고,
   * 다음 카드가 화면에 들어올 때 자연히 다시 시도된다.
   */
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasNextRef.current) return;
    loadingRef.current = true;
    try {
      const current = shortsRef.current;
      const feed = await getShortsFeed({ excludeIds: current.map((s) => s.id) });
      setShorts((prev) => {
        // 서버가 excludeIds를 받았으니 중복이 올 일은 없지만, 겹치면 리액트 key가 중복돼
        // 화면이 깨지므로 한 번 더 걸러낸다
        const seen = new Set(prev.map((s) => s.id));
        const fresh = feed.items.filter((item) => !seen.has(item.id));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
      setHasNext(feed.hasNext);
    } catch {
      // 무시 — 아래로 더 내리면 다시 시도된다
    } finally {
      loadingRef.current = false;
    }
  }, []);

  /*
   * 끝에서 PREFETCH_BEFORE_END 장 이내의 카드가 화면에 들어오면 다음 페이지를 미리 받는다.
   *
   * 맨 마지막 카드에 닿았을 때 받으면 이미 늦다 — 스크롤이 끝에서 멈춰 "더 없나?" 하는
   * 순간이 생긴다. 미리 받아두면 이어서 내려가는 동안 다음 카드가 이미 붙어 있다.
   */
  const handleCardEnter = useCallback(
    (index) => {
      const total = shortsRef.current.length;
      if (total > 0 && index >= total - PREFETCH_BEFORE_END) loadMore();
    },
    [loadMore]
  );

  // 좋아요·댓글 수가 바뀐 항목만 갈아끼운다 — 피드를 다시 불러오면 재생이 끊기기 때문
  const updateShort = (id, patch) =>
    setShorts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  /*
   * 삭제된 영상을 목록에서 뺀다. 목록을 다시 불러오지 않는 이유는 updateShort와 같다 —
   * 다시 받으면 보고 있던 위치와 재생이 함께 끊긴다.
   *
   * 마지막 한 장이었다면 목록이 비어 "아직 올라온 숏츠가 없습니다" 안내로 바뀐다.
   * 그 화면에도 업로드 버튼이 있어 막다른 길은 아니다.
   */
  const removeShort = (id) => setShorts((prev) => prev.filter((s) => s.id !== id));

  // 상태 메시지도 같은 9:16 박스 안에 넣는다 — 로딩→목록으로 바뀔 때 화면 크기가 튀지 않게
  if (error || shorts === null || shorts.length === 0) {
    return (
      <div className="sf-feed sf-feed-message">
        {/* 목록이 비어 있어도 업로드 화면으로는 갈 수 있어야 한다 */}
        <UploadButton />
        <p>
          {error
            ? error
            : shorts === null
              ? "불러오는 중…"
              : "아직 올라온 숏츠가 없습니다. 오른쪽 위 + 로 첫 영상을 올려보세요."}
        </p>
      </div>
    );
  }

  // sf-feed가 9:16 세로 박스 + 스크롤 컨테이너를 겸한다 (ShortsFeed.css 참고)
  return (
    <div className="sf-feed">
      {shorts.flatMap((s, index) => {
        const card = (
          <ShortCard
            key={s.id}
            data={s}
            /* 광고 카드가 사이에 끼어도 이 값은 **영상만 센 자리**여야 한다 —
               선반입 판정(handleCardEnter)이 shorts 배열의 길이와 비교하기 때문이다 */
            index={index}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onChange={updateShort}
            onEvent={handleEvent}
            onEnter={handleCardEnter}
            onRemove={removeShort}
          />
        );
        // 영상 ADS_EVERY개를 채운 자리마다 광고 한 장. 광고가 없으면 영상만 이어진다
        if (adRotation.length === 0 || (index + 1) % ADS_EVERY !== 0) return card;

        // 몇 번째 광고 자리인지 (0,1,2…). 섞어둔 순서를 이 번호로 순회한다
        const slot = (index + 1) / ADS_EVERY - 1;
        return [card, <AdCard key={`ad-${slot}`} ad={adRotation[slot % adRotation.length]} />];
      })}
    </div>
  );
}
