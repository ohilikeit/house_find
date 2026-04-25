"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { RoomType, ROOM_TYPES } from "@/lib/constants";
import { ArticleCard } from "@/components/ui/ArticleCard";
import Link from "next/link";

// ─── Types ───────────────────────────────────

interface Article {
  articleId: number;
  menuId: number;
  subject: string;
  writerNickname: string;
  writeDateTimestamp: number;
  readCount: number;
  commentCount: number;
  likeItCount: number;
  representImage: string;
  headName: string;
}

interface BoardArticles {
  menuId: number;
  menuName: string;
  articles: Article[];
  fetchedAt: string;
}

interface CrawlResult {
  boards: BoardArticles[];
  newArticles: Record<string, Article[]>;
  lastUpdated: string;
}

type SortMode = "latest" | "views" | "comments" | "likes";

// ─── Utilities ───────────────────────────────

function sortArticles(articles: Article[], mode: SortMode): Article[] {
  const sorted = [...articles];
  switch (mode) {
    case "latest":
      return sorted.sort(
        (a, b) => b.writeDateTimestamp - a.writeDateTimestamp
      );
    case "views":
      return sorted.sort((a, b) => b.readCount - a.readCount);
    case "comments":
      return sorted.sort((a, b) => b.commentCount - a.commentCount);
    case "likes":
      return sorted.sort((a, b) => b.likeItCount - a.likeItCount);
  }
}

// ─── Props ───────────────────────────────────

interface RoomListPageProps {
  roomType: RoomType;
}

// ─── Component ───────────────────────────────

export function RoomListPage({ roomType }: RoomListPageProps) {
  const config = ROOM_TYPES[roomType];
  const boards_config = config.boards;

  const [activeTab, setActiveTab] = useState<number | "all">("all");
  const [boards, setBoards] = useState<BoardArticles[]>([]);
  const [newArticles, setNewArticles] = useState<Record<string, Article[]>>(
    {}
  );
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterHead, setFilterHead] = useState<string>("all");

  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [bookmarkIds, setBookmarkIds] = useState<Set<number>>(new Set());
  const [slidingIds, setSlidingIds] = useState<Set<number>>(new Set());

  const slidingTimeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const boardCount = boards_config.length;
  const estimatedTime = boardCount * 2;

  // Load initial data (단일 RPC: get_room_data)
  useEffect(() => {
    fetch(`/api/${roomType}/init`)
      .then((r) => r.json())
      .then(
        (bundle: {
          boards: BoardArticles[];
          seen: Record<string, number>;
          bookmarks: Record<string, number>;
          lastUpdated: string | null;
        }) => {
          if (bundle.boards?.length) {
            setBoards(bundle.boards);
            setLastUpdated(bundle.lastUpdated);
          }
          if (bundle.seen) {
            setSeenIds(new Set(Object.keys(bundle.seen).map(Number)));
          }
          if (bundle.bookmarks) {
            setBookmarkIds(new Set(Object.keys(bundle.bookmarks).map(Number)));
          }
        }
      )
      .catch(() => {});
  }, [roomType]);

  const handleCrawl = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress(
      `${boardCount}개 게시판 크롤링 중... (약 ${estimatedTime}초 소요)`
    );
    try {
      const res = await fetch(`/api/${roomType}/crawl`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: CrawlResult = await res.json();
      setBoards(data.boards);
      setNewArticles(data.newArticles);
      setLastUpdated(data.lastUpdated);
      setProgress("");

      // 크롤 후 seen/bookmark 갱신 (autoMark, dedup 결과 반영)
      const initRes = await fetch(`/api/${roomType}/init`);
      const bundle = (await initRes.json()) as {
        seen: Record<string, number>;
        bookmarks: Record<string, number>;
      };
      if (bundle.seen) {
        setSeenIds(new Set(Object.keys(bundle.seen).map(Number)));
      }
      if (bundle.bookmarks) {
        setBookmarkIds(new Set(Object.keys(bundle.bookmarks).map(Number)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "크롤링 실패");
      setProgress("");
    } finally {
      setLoading(false);
    }
  }, [roomType, boardCount, estimatedTime]);

  const handleMarkSeen = useCallback(
    (id: number) => {
      setSlidingIds((prev) => new Set([...prev, id]));

      const timeout = setTimeout(() => {
        setSlidingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setSeenIds((prev) => new Set([...prev, id]));
        slidingTimeouts.current.delete(id);

        const article = boards
          .flatMap((b) => b.articles)
          .find((a) => a.articleId === id);
        fetch(`/api/${roomType}/seen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: [id],
            articles: article
              ? [{ articleId: id, subject: article.subject }]
              : [],
          }),
        }).catch(() => {});
      }, 500);

      slidingTimeouts.current.set(id, timeout);
    },
    [boards, roomType]
  );

  const handleToggleBookmark = useCallback(
    (id: number) => {
      const wasBookmarked = bookmarkIds.has(id);
      setBookmarkIds((prev) => {
        const next = new Set(prev);
        if (wasBookmarked) next.delete(id);
        else next.add(id);
        return next;
      });
      fetch(`/api/${roomType}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
        .then((r) => r.json())
        .then((res: { added: boolean }) => {
          // 서버 실제 상태로 동기화 (불일치 시 rollback)
          setBookmarkIds((prev) => {
            const next = new Set(prev);
            if (res.added) next.add(id);
            else next.delete(id);
            return next;
          });
        })
        .catch(() => {
          // 네트워크 실패 시 원복
          setBookmarkIds((prev) => {
            const next = new Set(prev);
            if (wasBookmarked) next.add(id);
            else next.delete(id);
            return next;
          });
        });
    },
    [roomType, bookmarkIds]
  );

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      slidingTimeouts.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ─── Derived data ───

  const currentArticles = useMemo(() => {
    if (activeTab === "all") return boards.flatMap((b) => b.articles);
    return boards.find((b) => b.menuId === activeTab)?.articles ?? [];
  }, [boards, activeTab]);

  const currentNewIds = useMemo(() => {
    if (activeTab === "all") {
      return new Set(
        Object.values(newArticles).flatMap((arr) =>
          arr.map((a) => a.articleId)
        )
      );
    }
    return new Set(
      (newArticles[activeTab] ?? []).map((a) => a.articleId)
    );
  }, [newArticles, activeTab]);

  const availableHeads = useMemo(() => {
    const heads = new Set<string>();
    currentArticles.forEach((a) => {
      if (a.headName) heads.add(a.headName);
    });
    return [...heads].sort();
  }, [currentArticles]);

  const filtered = useMemo(() => {
    let result = [...currentArticles];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.subject.toLowerCase().includes(q) ||
          a.writerNickname.toLowerCase().includes(q)
      );
    }
    if (filterHead !== "all") {
      result = result.filter((a) => a.headName === filterHead);
    }
    return sortArticles(result, sortMode);
  }, [currentArticles, searchQuery, filterHead, sortMode]);

  const currentUnread = useMemo(
    () =>
      filtered.filter(
        (a) => !seenIds.has(a.articleId) || slidingIds.has(a.articleId)
      ),
    [filtered, seenIds, slidingIds]
  );

  const currentRead = useMemo(
    () =>
      filtered.filter(
        (a) => seenIds.has(a.articleId) && !slidingIds.has(a.articleId)
      ),
    [filtered, seenIds, slidingIds]
  );

  const bookmarkedArticles = useMemo(() => {
    if (bookmarkIds.size === 0) return [];
    const all = boards.flatMap((b) => b.articles);
    return all.filter((a) => bookmarkIds.has(a.articleId));
  }, [boards, bookmarkIds]);

  const totalNewCount = Object.values(newArticles).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  const handleMarkAllSeenWithData = useCallback(() => {
    const unread = filtered.filter((a) => !seenIds.has(a.articleId));
    if (unread.length === 0) return;
    const unreadIds = unread.map((a) => a.articleId);

    setSlidingIds((prev) => new Set([...prev, ...unreadIds]));

    setTimeout(() => {
      setSlidingIds(new Set());
      setSeenIds((prev) => new Set([...prev, ...unreadIds]));
      fetch(`/api/${roomType}/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: unreadIds,
          articles: unread.map((a) => ({
            articleId: a.articleId,
            subject: a.subject,
          })),
        }),
      }).catch(() => {});
    }, 600);
  }, [filtered, seenIds, roomType]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* ─── Header ─── */}
      <header className="mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; 전체 목록
            </Link>
            <h1 className="text-2xl font-black uppercase tracking-tight mt-1">
              피터팬의 좋은방 구하기
            </h1>
            <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
              {config.subtitle}
            </p>
          </div>
          <button
            onClick={handleCrawl}
            disabled={loading}
            className="px-5 py-3 bg-primary text-primary-foreground text-sm font-black uppercase tracking-wider border-2 border-border shadow-md hover:shadow-lg hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-2xs active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-md transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                크롤링 중...
              </span>
            ) : (
              "최신화"
            )}
          </button>
        </div>

        {lastUpdated && (
          <p className="font-mono text-xs text-muted-foreground mt-2">
            Last updated: {new Date(lastUpdated).toLocaleString("ko-KR")}
          </p>
        )}

        {progress && (
          <div className="mt-3 border-2 border-border bg-accent/10 px-4 py-2.5 shadow-sm">
            <p className="text-sm font-bold text-accent animate-pulse">
              {progress}
            </p>
          </div>
        )}
        {error && (
          <div className="mt-3 border-2 border-border bg-primary/10 px-4 py-2.5 shadow-sm">
            <p className="text-sm font-bold text-primary">{error}</p>
          </div>
        )}
      </header>

      {/* ─── Stats row ─── */}
      {boards.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="border-2 border-border bg-card px-3 py-2 text-center shadow-2xs">
            <p className="font-mono text-lg font-bold">{filtered.length}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase">
              전체
            </p>
          </div>
          <div className="border-2 border-border bg-secondary px-3 py-2 text-center shadow-2xs">
            <p className="font-mono text-lg font-bold text-secondary-foreground">
              {
                currentUnread.filter((a) => !slidingIds.has(a.articleId))
                  .length
              }
            </p>
            <p className="text-[10px] text-secondary-foreground/70 font-bold uppercase">
              미확인
            </p>
          </div>
          <div className="border-2 border-border bg-muted px-3 py-2 text-center shadow-2xs">
            <p className="font-mono text-lg font-bold text-muted-foreground">
              {currentRead.length}
            </p>
            <p className="text-[10px] text-muted-foreground/70 font-bold uppercase">
              확인
            </p>
          </div>
          {totalNewCount > 0 && (
            <div className="border-2 border-border bg-primary px-3 py-2 text-center shadow-2xs">
              <p className="font-mono text-lg font-bold text-primary-foreground">
                {totalNewCount}
              </p>
              <p className="text-[10px] text-primary-foreground/70 font-bold uppercase">
                새 글
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-0 overflow-x-auto mb-4 scrollbar-hide">
        <button
          onClick={() => setActiveTab("all")}
          className={`shrink-0 px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 border-border transition-all -mr-[2px]
            ${
              activeTab === "all"
                ? "bg-foreground text-background z-10 relative"
                : "bg-card text-foreground hover:bg-muted"
            }`}
        >
          전체
          {totalNewCount > 0 && (
            <span className="ml-1 font-mono text-[10px] bg-secondary text-secondary-foreground px-1 py-px border-2 border-border">
              {totalNewCount}
            </span>
          )}
        </button>
        {boards_config.map((board) => {
          const newCount = (newArticles[board.menuId] ?? []).length;
          const isActive = activeTab === board.menuId;
          return (
            <button
              key={board.menuId}
              onClick={() => setActiveTab(board.menuId)}
              className={`shrink-0 px-3 py-2 text-xs font-bold border-2 border-border transition-all -mr-[2px]
                ${
                  isActive
                    ? "bg-foreground text-background z-10 relative"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
            >
              {board.shortName}
              {newCount > 0 && (
                <span className="ml-1 font-mono text-[10px] bg-secondary text-secondary-foreground px-1 py-px border-2 border-border">
                  {newCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Search & Filter ─── */}
      {boards.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색..."
              className="w-full pl-8 pr-8 py-2 text-xs font-medium bg-card border-2 border-border shadow-2xs focus:outline-none focus:shadow-sm transition-all placeholder:text-muted-foreground/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          <select
            value={filterHead}
            onChange={(e) => setFilterHead(e.target.value)}
            className="text-[10px] font-bold bg-card border-2 border-border px-2 py-2 shadow-2xs focus:outline-none cursor-pointer"
          >
            <option value="all">분류: 전체</option>
            {availableHeads.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-[10px] font-bold bg-card border-2 border-border px-2 py-2 shadow-2xs focus:outline-none cursor-pointer"
          >
            <option value="latest">최신순</option>
            <option value="views">조회수</option>
            <option value="comments">댓글</option>
            <option value="likes">좋아요</option>
          </select>
        </div>
      )}

      {/* ─── 2-Column Layout ─── */}
      {boards.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT: 미확인 (Unread) */}
          <div>
            <div className="flex items-center justify-between px-3 py-2 bg-secondary border-2 border-border border-b-0 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary border-2 border-border animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-wider text-secondary-foreground">
                  미확인{" "}
                  <span className="font-mono">
                    {
                      currentUnread.filter(
                        (a) => !slidingIds.has(a.articleId)
                      ).length
                    }
                  </span>
                </h2>
              </div>
              {currentUnread.filter((a) => !slidingIds.has(a.articleId))
                .length > 0 && (
                <button
                  onClick={handleMarkAllSeenWithData}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border-2 border-border bg-card hover:bg-muted transition-colors shadow-2xs"
                >
                  모두 확인
                </button>
              )}
            </div>
            <div className="border-2 border-border border-t-0 bg-background min-h-[200px] max-h-[70vh] overflow-y-auto scrollbar-hide">
              {currentUnread.length > 0 ? (
                <div className="flex flex-col gap-0">
                  {currentUnread.map((article) => (
                    <ArticleCard
                      key={article.articleId}
                      article={article}
                      isNew={currentNewIds.has(article.articleId)}
                      isSeen={false}
                      isSliding={slidingIds.has(article.articleId)}
                      isBookmarked={bookmarkIds.has(article.articleId)}
                      onMarkSeen={handleMarkSeen}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <p className="text-sm font-bold">모두 확인했습니다</p>
                    <p className="text-[10px] mt-1">새 글이 없습니다</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: 북마크 + 확인 완료 */}
          <div className="flex flex-col gap-4">
            {/* 북마크 섹션 */}
            {bookmarkedArticles.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-2 bg-chart-5 border-2 border-border border-b-0 shadow-sm">
                  <span className="text-sm">★</span>
                  <h2 className="text-xs font-black uppercase tracking-wider text-primary-foreground">
                    북마크{" "}
                    <span className="font-mono">
                      {bookmarkedArticles.length}
                    </span>
                  </h2>
                </div>
                <div className="border-2 border-border border-t-0 bg-background max-h-[35vh] overflow-y-auto scrollbar-hide">
                  <div className="flex flex-col gap-0">
                    {bookmarkedArticles.map((article) => (
                      <ArticleCard
                        key={`bm-${article.articleId}`}
                        article={article}
                        isNew={currentNewIds.has(article.articleId)}
                        isSeen={seenIds.has(article.articleId)}
                        isSliding={false}
                        isBookmarked={true}
                        onMarkSeen={handleMarkSeen}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 확인 완료 섹션 */}
            <div>
              <div className="flex items-center justify-between px-3 py-2 bg-muted border-2 border-border border-b-0 shadow-sm">
                <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  확인 완료{" "}
                  <span className="font-mono">{currentRead.length}</span>
                </h2>
              </div>
              <div className="border-2 border-border border-t-0 bg-background min-h-[200px] max-h-[50vh] overflow-y-auto scrollbar-hide">
                {currentRead.length > 0 ? (
                  <div className="flex flex-col gap-0">
                    {currentRead.map((article) => (
                      <ArticleCard
                        key={article.articleId}
                        article={article}
                        isNew={currentNewIds.has(article.articleId)}
                        isSeen={true}
                        isSliding={false}
                        isBookmarked={bookmarkIds.has(article.articleId)}
                        onMarkSeen={handleMarkSeen}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <p className="text-sm font-bold">
                        아직 확인한 글이 없습니다
                      </p>
                      <p className="text-[10px] mt-1">
                        왼쪽에서 글을 클릭하거나 &quot;확인 완료&quot; 버튼을
                        눌러주세요
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-border bg-card px-6 py-16 text-center shadow-md">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <p className="text-lg font-black uppercase tracking-wider mb-2">
            아직 데이터가 없습니다
          </p>
          <p className="text-sm text-muted-foreground">
            위의 &quot;최신화&quot; 버튼을 눌러 글을 가져오세요
          </p>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer className="mt-6 pt-3 border-t-2 border-border text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          글을 클릭하면 왼쪽에서 오른쪽으로 이동합니다
        </p>
      </footer>
    </div>
  );
}
