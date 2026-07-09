import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Gamepad2,
  HeartHandshake,
  Moon,
  QrCode,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { sampleMaps } from "./data/sampleMaps";
import "./styles.css";

const PADLET_URL = "https://padlet.com/bbssyy0329_1/padlet-n9zl71todza1xl7c";

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((acc, header, headerIndex) => {
      acc[header] = values[headerIndex] ?? "";
      return acc;
    }, {});
  });
}

function normalizeMapItem(item, index) {
  const postId = String(item.postId || item["게시물 번호"] || item.id || index + 1).trim();
  const manualThumbnail = String(item.thumbnail || item.thumbnailUrl || item["썸네일"] || item["이미지"] || "").trim();

  return {
    id: postId || `${index + 1}`,
    postId,
    studentId: String(item.studentId || item.number || item["학번"] || "").trim(),
    name: String(item.name || item["이름"] || "").trim(),
    title: String(item.title || item["작품제목"] || item["제목"] || `점프맵 ${postId}`).trim(),
    thumbnail: manualThumbnail || `/thumbnails/${postId}.png`,
    url: String(item.url || item.link || item["Delightex링크"] || item["링크"] || "").trim(),
  };
}

function normalizeReaction(item, index) {
  return {
    id: `${item.postId || item["게시물 번호"] || "unknown"}-${index}`,
    postId: String(item.postId || item["게시물 번호"] || "").trim(),
    reactor: String(item.reactor || item["이름"] || item.name || "").trim(),
    emoji: String(item.emoji || item["이모지"] || "").trim(),
  };
}

function normalizeReview(item, index) {
  return {
    id: `${item.name || item["이름"] || "review"}-${index}`,
    name: String(item.name || item["이름"] || "익명").trim(),
    comment: String(item.comment || item["소감"] || item["후기"] || item["내용"] || "").trim(),
  };
}

function getReactionSummary(reactions) {
  const counts = reactions.reduce((acc, reaction) => {
    if (!reaction.emoji) return acc;
    acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji, "ko"));
}

function isPlaceholderUrl(url) {
  return /ABC-DEF|GHI-JKL|MNO-PQR|학생링크/.test(url || "");
}

function App() {
  const [maps, setMaps] = useState(sampleMaps.map(normalizeMapItem));
  const [reactions, setReactions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("postIdAsc");
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [previewMap, setPreviewMap] = useState(null);
  const [qrMap, setQrMap] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    async function loadCsvFiles() {
      try {
        const [mapsResponse, reactionsResponse, reviewsResponse] = await Promise.all([
          fetch("/jumpmaps.csv", { cache: "no-store" }),
          fetch("/reactions.csv", { cache: "no-store" }),
          fetch("/reviews.csv", { cache: "no-store" }),
        ]);

        if (mapsResponse.ok) {
          const csvMaps = parseCsv(await mapsResponse.text()).map(normalizeMapItem).filter((item) => item.url);
          if (csvMaps.length > 0) setMaps(csvMaps);
        }

        if (reactionsResponse.ok) {
          const csvReactions = parseCsv(await reactionsResponse.text())
            .map(normalizeReaction)
            .filter((item) => item.postId && item.emoji);
          setReactions(csvReactions);
        }

        if (reviewsResponse.ok) {
          const csvReviews = parseCsv(await reviewsResponse.text())
            .map(normalizeReview)
            .filter((item) => item.comment);
          setReviews(csvReviews);
        }
      } catch (error) {
        console.warn("CSV 파일을 불러오지 못했습니다.", error);
      }
    }

    loadCsvFiles();
  }, []);

  const reactionsByPostId = useMemo(() => {
    return reactions.reduce((acc, reaction) => {
      if (!acc[reaction.postId]) acc[reaction.postId] = [];
      acc[reaction.postId].push(reaction);
      return acc;
    }, {});
  }, [reactions]);

  const mapsWithReactions = useMemo(() => {
    return maps.map((map) => {
      const itemReactions = reactionsByPostId[map.postId] || [];
      return {
        ...map,
        reactions: itemReactions,
        reactionSummary: getReactionSummary(itemReactions),
        reactionTotal: itemReactions.length,
      };
    });
  }, [maps, reactionsByPostId]);

  const filteredMaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return mapsWithReactions
      .filter((map) => {
        if (!normalizedQuery) return true;
        const searchable = [
          map.postId,
          map.studentId,
          map.name,
          map.title,
          map.reactionSummary.map((item) => item.emoji).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortKey === "studentIdAsc") {
          const aKey = a.studentId || a.postId;
          const bKey = b.studentId || b.postId;
          return String(aKey).localeCompare(String(bKey), "ko", { numeric: true });
        }
        if (sortKey === "nameAsc") return (a.name || "").localeCompare(b.name || "", "ko");
        if (sortKey === "reactionDesc") {
          const reactionDiff = Number(b.reactionTotal || 0) - Number(a.reactionTotal || 0);
          if (reactionDiff !== 0) return reactionDiff;
          return String(a.postId).localeCompare(String(b.postId), "ko", { numeric: true });
        }
        return String(a.postId).localeCompare(String(b.postId), "ko", { numeric: true });
      });
  }, [mapsWithReactions, query, sortKey]);

  const totalReactions = reactions.length;
  const placeholderCount = maps.filter((item) => isPlaceholderUrl(item.url)).length;

  return (
    <div className="site-shell">
      <header className="hero">
        <nav className="top-bar" aria-label="상단 메뉴">
          <a className="brand" href="#top" aria-label="동명 점프맵 월드 홈">
            <span className="brand-icon"><Gamepad2 size={22} /></span>
            <span>동명 점프맵 월드</span>
          </a>
          <div className="top-actions">
            <a className="ghost-button" href={PADLET_URL} target="_blank" rel="noreferrer">
              Padlet 원본
              <ArrowUpRight size={16} />
            </a>
            <button className="theme-button" onClick={() => setDarkMode((value) => !value)} type="button">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              {darkMode ? "라이트" : "다크"}
            </button>
          </div>
        </nav>

        <section className="hero-content" id="top">
          <div className="hero-badge"><Sparkles size={16} /> Delightex 동아리 작품 전시 공간</div>
          <h1>동아리 친구들이 만든<br />점프맵을 체험해 보세요!</h1>
          <p>
            동명중학교 동아리 학생들이 Delightex로 만든 점프맵 작품을 한곳에 모았습니다.
            Padlet에 남긴 이모티콘 반응도 작품 카드에서 함께 확인할 수 있습니다.
          </p>
          <div className="hero-stats" aria-label="작품 통계">
            <div><strong>{maps.length}</strong><span>등록 작품</span></div>
            <div><strong>{new Set(maps.map((item) => item.studentId || item.postId)).size}</strong><span>작품 번호</span></div>
            <div><strong>{totalReactions}</strong><span>이모티콘 반응</span></div>
          </div>
        </section>
      </header>

      <main className="content">
        {placeholderCount > 0 && (
          <div className="notice">
            <HeartHandshake size={18} />
            <span>
              현재는 예시 링크가 들어 있습니다. <strong>public/jumpmaps.csv</strong>에 실제 학번과 작품 정보를 수정하면 바로 반영됩니다.
            </span>
          </div>
        )}

        <section className="controls" aria-label="점프맵 검색 및 정렬">
          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="작품 번호, 학번, 이름, 작품 제목으로 검색"
              aria-label="점프맵 검색"
            />
          </div>

          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value)}
            aria-label="정렬 방식"
          >
            <option value="postIdAsc">작품 번호순</option>
            <option value="studentIdAsc">학번순</option>
            <option value="nameAsc">이름순</option>
            <option value="reactionDesc">이모티콘 반응 많은 순</option>
          </select>
        </section>

        <section className="summary-row">
          <h2>점프맵 갤러리</h2>
          <span>총 {filteredMaps.length}개 표시</span>
        </section>

        {filteredMaps.length === 0 ? (
          <div className="empty-state">
            <Gamepad2 size={40} />
            <p>조건에 맞는 점프맵이 없습니다.</p>
            <button type="button" onClick={() => setQuery("")}>검색 초기화</button>
          </div>
        ) : (
          <section className="gallery" aria-label="점프맵 작품 목록">
            {filteredMaps.map((map) => (
              <JumpMapCard
                key={map.id}
                map={map}
                onPreview={() => setPreviewMap(map)}
                onQr={() => setQrMap(map)}
              />
            ))}
          </section>
        )}

        {reviews.length > 0 && (
          <section className="reviews-section" aria-label="활동 소감 및 후기">
            <div className="summary-row reviews-title">
              <h2>소감 및 후기</h2>
              <span>{reviews.length}개</span>
            </div>
            <div className="reviews-grid">
              {reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <strong>{review.name}</strong>
                  <p>{review.comment}</p>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Made by 동명중학교 동아리 students</span>
        <span>·</span>
        <span>Delightex Jump Map Gallery</span>
      </footer>

      {previewMap && <PreviewModal map={previewMap} onClose={() => setPreviewMap(null)} />}
      {qrMap && <QrModal map={qrMap} onClose={() => setQrMap(null)} />}
    </div>
  );
}

function JumpMapCard({ map, onPreview, onQr }) {
  const isPlaceholder = isPlaceholderUrl(map.url);
  const label = map.studentId ? `학번 ${map.studentId}` : `작품 ${map.postId}번`;

  return (
    <article className="map-card">
      <Thumbnail map={map} />

      <div className="card-topline">
        <span className="student-pill">{label}</span>
        <span className="reaction-total">이모티콘 {map.reactionTotal || 0}개</span>
      </div>

      <h3>{map.title}</h3>

      {map.name ? <div className="creator">제작: {map.name}</div> : null}

      <div className="emoji-reactions" aria-label="Padlet 이모티콘 반응">
        <div className="emoji-heading">Padlet 반응</div>
        {map.reactionSummary.length > 0 ? (
          <div className="emoji-list">
            {map.reactionSummary.map((reaction) => (
              <span className="emoji-chip" key={reaction.emoji}>
                <span aria-hidden="true">{reaction.emoji}</span>
                <strong>{reaction.count}</strong>
              </span>
            ))}
          </div>
        ) : (
          <p className="no-reactions">아직 이모티콘 반응이 없습니다.</p>
        )}
      </div>

      <div className="card-actions">
        <button type="button" className="primary-button" onClick={onPreview} disabled={!map.url || isPlaceholder}>
          <Gamepad2 size={17} />
          점프맵 체험하기
        </button>
        <button type="button" className="secondary-button" onClick={onQr} disabled={!map.url || isPlaceholder}>
          <QrCode size={17} />
          QR 보기
        </button>
      </div>

      <a
        className={`open-link ${!map.url || isPlaceholder ? "disabled" : ""}`}
        href={map.url || undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!map.url || isPlaceholder}
      >
        새 탭에서 열기 <ArrowUpRight size={15} />
      </a>
    </article>
  );
}

function Thumbnail({ map }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="thumbnail-wrap">
      {!failed && map.thumbnail ? (
        <img
          src={map.thumbnail}
          alt={`${map.title} 썸네일`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="thumbnail-placeholder">
          <Gamepad2 size={32} />
          <span>썸네일 준비중</span>
        </div>
      )}
    </div>
  );
}


function PreviewModal({ map, onClose }) {
  const label = map.studentId ? `학번 ${map.studentId}` : `작품 ${map.postId}번`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${map.title} 점프맵 미리보기`}>
      <div className="preview-modal">
        <div className="modal-header">
          <div>
            <span>{label}{map.name ? ` · ${map.name}` : ""}</span>
            <h2>{map.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={22} /></button>
        </div>
        <div className="iframe-wrap">
          <iframe
            src={map.url}
            title={map.title}
            allow="fullscreen; vr; xr-spatial-tracking; accelerometer; gyroscope; magnetometer"
            allowFullScreen
          />
          <div className="iframe-help">
            화면 안에서 로딩이 안 되면 아래 버튼으로 새 탭에서 열어 주세요.
          </div>
        </div>
        <div className="modal-footer">
          <a className="primary-button" href={map.url} target="_blank" rel="noreferrer">
            새 탭에서 크게 열기 <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}

function QrModal({ map, onClose }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(map.url)}`;
  const label = map.studentId ? `학번 ${map.studentId}` : `작품 ${map.postId}번`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${map.title} QR 코드`}>
      <div className="qr-modal">
        <div className="modal-header">
          <div>
            <span>{label}{map.name ? ` · ${map.name}` : ""}</span>
            <h2>{map.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={22} /></button>
        </div>
        <div className="qr-box">
          <img src={qrUrl} alt={`${map.title} QR 코드`} />
          <p>휴대폰 카메라로 QR 코드를 찍으면 점프맵을 바로 열 수 있습니다.</p>
        </div>
        <a className="open-link" href={map.url} target="_blank" rel="noreferrer">
          링크 직접 열기 <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
