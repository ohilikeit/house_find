"use client";

import { Thumbnail } from "./Thumbnail";

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

interface ArticleCardProps {
  article: Article;
  isNew: boolean;
  isSeen: boolean;
  isSliding: boolean;
  isBookmarked: boolean;
  onMarkSeen: (id: number) => void;
  onToggleBookmark: (id: number) => void;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}.${day} ${hours}:${minutes}`;
}

function parsePriceFromSubject(
  subject: string
): { deposit?: string; rent?: string } | null {
  const match = subject.match(/(\d{1,5})\s*[\/]\s*(\d{1,4})/);
  if (!match) return null;
  return { deposit: match[1], rent: match[2] };
}

export function ArticleCard({
  article,
  isNew,
  isSeen,
  isSliding,
  isBookmarked,
  onMarkSeen,
  onToggleBookmark,
}: ArticleCardProps) {
  const cafeUrl = `https://m.cafe.naver.com/ca-fe/web/cafes/10322296/articles/${article.articleId}`;
  const price = parsePriceFromSubject(article.subject);

  const openSplitView = () => {
    const screenW = window.screen.availWidth;
    const screenH = window.screen.availHeight;
    const popW = Math.floor(screenW / 2);
    const popLeft = screenW - popW;
    window.open(
      cafeUrl,
      "cafe_preview",
      `width=${popW},height=${screenH},left=${popLeft},top=0`
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isSeen) {
      onMarkSeen(article.articleId);
    }
    openSplitView();
  };

  return (
    <div
      className={`border-2 border-border bg-card transition-all overflow-hidden
        ${isSliding ? "animate-slide-out-right" : "animate-fade-in"}
        ${isSeen ? "opacity-[0.5]" : ""}
      `}
    >
      <a
        href={cafeUrl}
        target="cafe_preview"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="block px-3 py-2.5 hover:bg-muted transition-colors"
      >
        <div className="flex gap-2.5">
          <Thumbnail src={article.representImage} />
          <div className="flex-1 min-w-0">
            {/* badges */}
            <div className="flex items-center gap-1 flex-wrap mb-0.5">
              {isNew && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-primary text-primary-foreground border-2 border-border px-1 py-px shadow-2xs">
                  New
                </span>
              )}
              {article.headName && (
                <span className="text-[9px] font-bold bg-accent text-accent-foreground border-2 border-border px-1 py-px">
                  {article.headName}
                </span>
              )}
              {price && (
                <span className="font-mono text-[10px] font-bold bg-secondary text-secondary-foreground border-2 border-border px-1 py-px">
                  {price.deposit}/{price.rent}
                </span>
              )}
            </div>

            {/* title */}
            <p
              className={`text-[13px] leading-snug line-clamp-2 ${
                isSeen
                  ? "text-muted-foreground"
                  : "font-bold text-foreground"
              }`}
            >
              {article.subject}
            </p>

            {/* meta */}
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
              <span>{formatDate(article.writeDateTimestamp)}</span>
              <span className="flex items-center gap-0.5">
                <svg
                  className="w-2.5 h-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
                {article.readCount}
              </span>
              {article.commentCount > 0 && (
                <span className="text-accent">
                  {article.commentCount}댓글
                </span>
              )}
            </div>
          </div>
        </div>
      </a>

      {/* 액션 버튼 */}
      <div className="flex border-t-2 border-border">
        {!isSeen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkSeen(article.articleId);
            }}
            className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
          >
            확인 완료
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(article.articleId);
          }}
          className={`${!isSeen ? "border-l-2 border-border" : "flex-1"} px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            isBookmarked
              ? "bg-chart-5 text-primary-foreground"
              : "bg-muted/50 hover:bg-muted text-muted-foreground"
          }`}
        >
          {isBookmarked ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}
