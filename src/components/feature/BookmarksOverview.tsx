"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { BookmarkItem } from "@/lib/supabase/database";
import { ROOM_TYPES, RoomType, VALID_ROOM_TYPES } from "@/lib/constants";
import { Thumbnail } from "@/components/ui/Thumbnail";

interface Props {
  initialItems: BookmarkItem[];
}

interface BoardGroup {
  menuId: number;
  menuName: string;
  shortName: string;
  items: BookmarkItem[];
}

interface RoomGroup {
  roomType: RoomType;
  roomLabel: string;
  totalCount: number;
  boards: BoardGroup[];
}

function groupByRoomAndBoard(items: BookmarkItem[]): RoomGroup[] {
  const roomMap = new Map<RoomType, Map<number, BoardGroup>>();

  for (const item of items) {
    if (!VALID_ROOM_TYPES.includes(item.roomType)) continue;
    let boardMap = roomMap.get(item.roomType);
    if (!boardMap) {
      boardMap = new Map();
      roomMap.set(item.roomType, boardMap);
    }
    let board = boardMap.get(item.menuId);
    if (!board) {
      board = {
        menuId: item.menuId,
        menuName: item.menuName,
        shortName: item.shortName,
        items: [],
      };
      boardMap.set(item.menuId, board);
    }
    board.items.push(item);
  }

  const orderedRooms: RoomGroup[] = [];
  for (const rt of VALID_ROOM_TYPES) {
    const boardMap = roomMap.get(rt);
    if (!boardMap || boardMap.size === 0) continue;
    const boards = [...boardMap.values()].sort((a, b) =>
      a.shortName.localeCompare(b.shortName, "ko")
    );
    const totalCount = boards.reduce((s, b) => s + b.items.length, 0);
    orderedRooms.push({
      roomType: rt,
      roomLabel: ROOM_TYPES[rt].label,
      totalCount,
      boards,
    });
  }
  return orderedRooms;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function parsePriceFromSubject(subject: string): string | null {
  const match = subject.match(/(\d{1,5})\s*[/]\s*(\d{1,4})/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function openSplitView(articleId: number) {
  const cafeUrl = `https://m.cafe.naver.com/ca-fe/web/cafes/10322296/articles/${articleId}`;
  if (typeof window === "undefined") return;
  const screenW = window.screen.availWidth;
  const screenH = window.screen.availHeight;
  const popW = Math.floor(screenW / 2);
  const popLeft = screenW - popW;
  window.open(
    cafeUrl,
    "cafe_preview",
    `width=${popW},height=${screenH},left=${popLeft},top=0`
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function BookmarksOverview({ initialItems }: Props) {
  const [items, setItems] = useState<BookmarkItem[]>(initialItems);
  const [activeRoom, setActiveRoom] = useState<RoomType | "all">("all");
  const [isPending, startTransition] = useTransition();

  const grouped = useMemo(() => groupByRoomAndBoard(items), [items]);

  const visibleRooms = useMemo(() => {
    if (activeRoom === "all") return grouped;
    return grouped.filter((g) => g.roomType === activeRoom);
  }, [grouped, activeRoom]);

  const totalCount = items.length;

  function handleRemove(item: BookmarkItem) {
    startTransition(() => {
      setItems((prev) =>
        prev.filter(
          (i) => !(i.articleId === item.articleId && i.roomType === item.roomType)
        )
      );
    });
    fetch(`/api/${item.roomType}/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.articleId }),
    })
      .then((r) => r.json())
      .then((res: { added: boolean }) => {
        if (res.added) {
          setItems((prev) => [...prev, item]);
        }
      })
      .catch(() => {
        setItems((prev) => [...prev, item]);
      });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* ─── Header ─── */}
      <header className="mb-5">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; 전체 목록
        </Link>
        <div className="flex items-end justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">
              북마크 모아보기
            </h1>
            <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
              방 유형 · 게시판 별 정리
            </p>
          </div>
          <div className="border-2 border-border bg-card px-3 py-2 text-center shadow-2xs">
            <p className="font-mono text-lg font-bold">{totalCount}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase">
              전체 북마크
            </p>
          </div>
        </div>
      </header>

      {/* ─── Room tabs ─── */}
      <div className="flex gap-0 overflow-x-auto mb-5 scrollbar-hide">
        <button
          onClick={() => setActiveRoom("all")}
          className={`shrink-0 px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 border-border transition-all -mr-[2px] ${
            activeRoom === "all"
              ? "bg-foreground text-background z-10 relative"
              : "bg-card text-foreground hover:bg-muted"
          }`}
        >
          전체
          <span className="ml-1 font-mono text-[10px] bg-secondary text-secondary-foreground px-1 py-px border-2 border-border">
            {totalCount}
          </span>
        </button>
        {grouped.map((room) => {
          const isActive = activeRoom === room.roomType;
          return (
            <button
              key={room.roomType}
              onClick={() => setActiveRoom(room.roomType)}
              className={`shrink-0 px-3 py-2 text-xs font-bold border-2 border-border transition-all -mr-[2px] ${
                isActive
                  ? "bg-foreground text-background z-10 relative"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              {room.roomLabel}
              <span className="ml-1 font-mono text-[10px] bg-secondary text-secondary-foreground px-1 py-px border-2 border-border">
                {room.totalCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Empty state ─── */}
      {totalCount === 0 && (
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
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
          <p className="text-lg font-black uppercase tracking-wider mb-2">
            아직 북마크가 없습니다
          </p>
          <p className="text-sm text-muted-foreground">
            각 방 유형 페이지에서 ★ 버튼으로 저장하세요
          </p>
        </div>
      )}

      {/* ─── Room sections ─── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-6"
      >
        {visibleRooms.map((room) => (
          <motion.section key={room.roomType} variants={itemVariants}>
            {/* Room heading */}
            <div className="flex items-center justify-between px-3 py-2 bg-foreground text-background border-2 border-border shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider">
                  {room.roomLabel}
                </h2>
                <span className="font-mono text-[10px] bg-secondary text-secondary-foreground border-2 border-border px-1.5 py-px">
                  {room.totalCount}
                </span>
              </div>
              <Link
                href={`/${room.roomType}`}
                className="text-[10px] font-bold uppercase tracking-wider hover:underline"
              >
                바로가기 &rarr;
              </Link>
            </div>

            {/* Boards within room */}
            <div className="border-2 border-border border-t-0 bg-background divide-y-2 divide-border">
              {room.boards.map((board) => (
                <div key={board.menuId}>
                  {/* Board sub-heading */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b-2 border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                        {board.shortName}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/70">
                        {board.menuName}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold">
                      {board.items.length}
                    </span>
                  </div>

                  {/* Bookmark items */}
                  <ul className="divide-y divide-border/60">
                    {board.items.map((item) => (
                      <BookmarkRow
                        key={`${item.roomType}-${item.articleId}`}
                        item={item}
                        onRemove={() => handleRemove(item)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </motion.div>

      {isPending && (
        <p className="mt-3 text-[10px] text-muted-foreground font-mono text-center">
          updating...
        </p>
      )}

      <footer className="mt-8 pt-3 border-t-2 border-border text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          항목을 클릭하면 새 창으로 열립니다 · ★ 클릭으로 해제
        </p>
      </footer>
    </div>
  );
}

function BookmarkRow({
  item,
  onRemove,
}: {
  item: BookmarkItem;
  onRemove: () => void;
}) {
  const price = parsePriceFromSubject(item.subject);

  return (
    <li className="flex gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors">
      <button
        onClick={() => openSplitView(item.articleId)}
        className="flex-shrink-0"
        aria-label="원문 열기"
      >
        <Thumbnail src={item.representImage} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap mb-0.5">
          {item.headName && (
            <span className="text-[9px] font-bold bg-accent text-accent-foreground border-2 border-border px-1 py-px">
              {item.headName}
            </span>
          )}
          {price && (
            <span className="font-mono text-[10px] font-bold bg-secondary text-secondary-foreground border-2 border-border px-1 py-px">
              {price}
            </span>
          )}
        </div>
        <button
          onClick={() => openSplitView(item.articleId)}
          className="block text-left w-full"
        >
          <p className="text-[13px] leading-snug line-clamp-2 font-bold text-foreground">
            {item.subject}
          </p>
        </button>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground font-mono">
          <span>{formatDate(item.writeDateTimestamp)}</span>
          <span>{item.writerNickname}</span>
          <span>조회 {item.readCount}</span>
          {item.commentCount > 0 && (
            <span className="text-accent">{item.commentCount}댓글</span>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="flex-shrink-0 self-start px-2 py-1 text-xs bg-chart-5 text-primary-foreground border-2 border-border hover:opacity-90 active:scale-95 transition"
        aria-label="북마크 해제"
      >
        ★
      </button>
    </li>
  );
}
