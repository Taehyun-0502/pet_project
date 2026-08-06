// ShortsFeed.jsx
// 숏츠(릴스) 피드 — GET /api/shorts 로 DB의 영상 목록을 받아 세로 스크롤로 보여준다.
// 좋아요·댓글은 서버에 반영된다 (4단계).
//
// 응답 항목 필드:
//   { id, memberName, videoUrl, thumbnailUrl, caption, durationSec,
//     viewCount, likeCount, commentCount, createdAt, likedByMe }

import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../member/AuthContext";
import CommentSheet from "./CommentSheet";
import { getShortsFeed, toggleShortLike } from "./shortsApi";
import "./ShortsFeed.css";

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "천" : "" + n);

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
function ShortCard({ data, muted, onToggleMute, onChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cardRef = useRef(null);
  const videoRef = useRef(null);
  // 지금 이 카드가 화면에 있는지. onEnded 가드에 쓰므로 state가 아니라 ref로 둔다(리렌더 불필요)
  const visibleRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [actionError, setActionError] = useState("");

  // 화면에 50% 이상 보이면 재생, 벗어나면 정지+처음으로
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) video.play().catch(() => {});
        else { video.pause(); video.currentTime = 0; }
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const handleTap = () => {
    const v = videoRef.current;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  // 영상이 끝나면 다음 카드로 자동 스크롤. scroll-snap이 걸려 있어 부드럽게 다음 칸에 붙는다.
  // 마지막 영상은 넘어갈 곳이 없으므로 처음부터 다시 재생한다(마지막 프레임에서 멈추지 않게)
  const onEnded = () => {
    // 화면 밖 영상이 끝나면서 스크롤을 가로채는 것을 막는다
    if (!visibleRef.current) return;

    const next = cardRef.current?.nextElementSibling;
    if (next) {
      next.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const v = videoRef.current;
    v.currentTime = 0;
    v.play().catch(() => {});
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
    <div className="sf-card" ref={cardRef} onClick={handleTap}>
      <div className="sf-fallback" style={{ background: bgOf(data.id) }}>🐾</div>
      {/* loop을 뺐다 — 반복 재생되면 ended가 아예 발생하지 않아 자동 넘김이 동작하지 않는다 */}
      <video
        ref={videoRef}
        src={data.videoUrl}
        poster={data.thumbnailUrl ?? undefined}
        muted={muted}
        playsInline
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
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
  const [muted, setMuted] = useState(true); // 모바일 자동재생은 muted 필수
  const [shorts, setShorts] = useState(null); // null = 아직 불러오는 중
  const [error, setError] = useState("");

  useEffect(() => {
    // 첫 페이지만 받는다. 응답의 nextCursor로 이어서 더 받는 무한 스크롤은 5단계(다듬기) 몫
    getShortsFeed()
      .then((feed) => setShorts(feed.items))
      .catch((err) => setError(err.message));
  }, []);

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
      {shorts.map((s) => (
        <ShortCard
          key={s.id}
          data={s}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onChange={updateShort}
        />
      ))}
    </div>
  );
}
