// ShortsFeed.jsx
// 숏츠(릴스) 피드 — GET /api/shorts 로 DB의 영상 목록을 받아 세로 스크롤로 보여준다.
// 좋아요·댓글은 서버에 반영된다 (4단계).
//
// 응답 항목 필드:
//   { id, memberName, videoUrl, thumbnailUrl, caption, durationSec,
//     viewCount, likeCount, commentCount, createdAt, likedByMe }

import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../member/AuthContext";
import CommentSheet from "./CommentSheet";
import { getShortsFeed, sendShortsEvent, toggleShortLike } from "./shortsApi";
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

// 영상이 로드되기 전에 보이는 배경. DB에 없는 순수 표시용 값이라 id로 색만 골라 쓴다
const FALLBACK_BG = [
  "linear-gradient(135deg,#ff9a56,#ff6a88)",
  "linear-gradient(135deg,#6a5acd,#48c6ef)",
  "linear-gradient(135deg,#43e97b,#38f9d7)",
  "linear-gradient(135deg,#fa709a,#fee140)",
  "linear-gradient(135deg,#30cfd0,#330867)",
];
const bgOf = (id) => FALLBACK_BG[id % FALLBACK_BG.length];

// 업로드 화면 진입점. 카드는 한 장이 화면을 꽉 채우므로 카드마다 하나씩 두면
// 지금 보이는 화면에 항상 떠 있는 것처럼 보인다 (빈 목록 화면에도 필요)
const UploadButton = () => (
  <Link className="sf-upload" to="/shorts/new" aria-label="숏츠 올리기" onClick={(e) => e.stopPropagation()}>
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
const Sound = ({ muted }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />}
  </svg>
);

/* ───────── 영상 카드 하나 ───────── */
function ShortCard({ data, index, muted, onToggleMute, onChange, onEvent, onEnter }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  // 지금 이 카드가 화면에 있는지. 탭에 돌아왔을 때 시계를 다시 돌릴지 판단하는 데 쓴다.
  // state가 아니라 ref인 이유 — 화면에 그릴 값이 아니라서 리렌더가 필요 없다
  const visibleRef = useRef(false);
  // 이번 시청 묶음에서 지금까지 쌓인 시간(ms). loop이므로 영상 길이를 넘어 계속 커진다
  const watchedMsRef = useRef(0);
  // 지금 돌고 있는 구간의 시작 시각. null이면 시계가 멈춘 상태(화면 밖이거나 탭이 숨겨짐)
  const runningSinceRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [actionError, setActionError] = useState("");

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

    // 시계를 멈추고 그동안 흐른 시간을 누적한다. 여러 번 불려도 안전하다
    const pauseClock = () => {
      if (runningSinceRef.current === null) return;
      watchedMsRef.current += performance.now() - runningSinceRef.current;
      runningSinceRef.current = null;
    };
    const startClock = () => {
      if (runningSinceRef.current !== null) return;
      runningSinceRef.current = performance.now();
    };

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
          startClock();
          onEvent(id, "view");
          // 끝에 가까워졌는지 부모가 판단한다. view 이벤트와 달리 중복 억제나 로그인 조건이
          // 없어야 해서(비로그인도 스크롤은 한다) 별도 통로로 알린다
          onEnter(index);
        } else {
          video.pause();
          video.currentTime = 0;
          emitWatch();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);

    /*
     * 탭을 숨기면 시계만 멈춘다 — 보내지는 않는다 (가이드 3-4절 ③).
     *
     * 돌아왔을 때 이어서 세는 이유: 한 번의 시청이 두 건으로 쪼개지면 점수가 오히려 커진다.
     * 시청점수가 ln(1+완료율)로 위로 볼록해서 ln(1.5)+ln(1.5) > ln(2) 이기 때문이다.
     */
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") pauseClock();
      else if (visibleRef.current) startClock();
    };
    // 페이지가 정말 사라지는 시점. 여기서는 마감해서 보낸다 —
    // 부모의 flush(keepalive)가 이 뒤에 실행돼야 큐에 든 것이 함께 나가는데,
    // 리액트는 자식 effect를 부모보다 먼저 실행하므로 이 리스너가 먼저 등록된다
    const onPageHide = () => emitWatch();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    // 관찰자를 끊는 것만으로는 '벗어남' 콜백이 오지 않는다 — 보던 중에 다른 화면으로
    // 이동하면 마지막 시청 기록이 통째로 사라지므로 여기서 직접 남긴다
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      emitWatch();
    };
  }, [id, durationSec, index, onEvent, onEnter]);

  const handleTap = () => {
    const v = videoRef.current;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v?.duration) setProgress((v.currentTime / v.duration) * 100);
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
      <video
        ref={videoRef}
        src={data.videoUrl}
        poster={data.thumbnailUrl ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
      />
      <div className="sf-scrim" />
      <UploadButton />

      <div className="sf-info">
        <div className="sf-user">
          <span className="sf-avatar">🐾</span>
          <span className="sf-name">@{data.memberName}</span>
        </div>
        <div className="sf-caption">{data.caption}</div>
      </div>

      <div className="sf-actions" onClick={(e) => e.stopPropagation()}>
        <button className={data.likedByMe ? "sf-liked" : ""} onClick={onLike} disabled={likePending}>
          <Heart filled={data.likedByMe} /><span>{fmt(data.likeCount)}</span>
        </button>
        <button onClick={() => setCommentsOpen(true)}>
          <Comment /><span>{fmt(data.commentCount)}</span>
        </button>
        <button><Share /><span>공유</span></button>
        <button onClick={onToggleMute}><Sound muted={muted} /><span>{muted ? "음소거" : "소리"}</span></button>
      </div>

      {actionError && <p className="sf-action-error">{actionError}</p>}

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

      <div className="sf-progress"><i style={{ width: progress + "%" }} /></div>
    </div>
  );
}

/* ───────── 피드 전체 ───────── */
export default function ShortsFeed() {
  const { user } = useAuth();
  const [muted, setMuted] = useState(true); // 모바일 자동재생은 muted 필수
  const [shorts, setShorts] = useState(null); // null = 아직 불러오는 중
  const [error, setError] = useState("");
  // 서버가 "더 있다"고 알려준 값. 다음 페이지를 받을지 판단한다
  const [hasNext, setHasNext] = useState(false);

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
    // 첫 페이지. 목록은 이미 점수 순으로 정렬돼 있어 그대로 그리면 된다
    getShortsFeed()
      .then((feed) => {
        setShorts(feed.items);
        setHasNext(feed.hasNext);
      })
      .catch((err) => setError(err.message));
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
      {shorts.map((s, index) => (
        <ShortCard
          key={s.id}
          data={s}
          index={index}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onChange={updateShort}
          onEvent={handleEvent}
          onEnter={handleCardEnter}
        />
      ))}
    </div>
  );
}
