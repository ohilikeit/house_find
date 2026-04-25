"use client";

import Link from "next/link";
import { ROOM_TYPES, RoomType } from "@/lib/constants";
import { motion } from "framer-motion";
import RefreshAllButton from "@/components/feature/RefreshAllButton";

const roomTypeCards: {
  type: RoomType;
  icon: React.ReactNode;
  description: string;
  boardCount: number;
}[] = [
  {
    type: "oneroom",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21"
        />
      </svg>
    ),
    description: "서대문, 마포, 중구, 종로 등 6개 지역",
    boardCount: ROOM_TYPES.oneroom.boards.length,
  },
  {
    type: "twothree",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
        />
      </svg>
    ),
    description: "성북, 성동, 마포, 은평 등 4개 지역",
    boardCount: ROOM_TYPES.twothree.boards.length,
  },
  {
    type: "officetel",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10zm4 4h2v3H8v-3zm6 0h2v3h-2v-3z"
        />
      </svg>
    ),
    description: "서울 월세",
    boardCount: ROOM_TYPES.officetel.boards.length,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <header className="text-center mb-10">
        <h1 className="text-3xl font-black uppercase tracking-tight">
          피터팬의 좋은방 구하기
        </h1>
        <p className="text-sm text-muted-foreground font-bold uppercase tracking-wider mt-2">
          네이버 카페 새 글 모니터
        </p>
      </header>

      <RefreshAllButton />

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {roomTypeCards.map((card) => {
          const config = ROOM_TYPES[card.type];
          return (
            <motion.div key={card.type} variants={cardVariants}>
              <Link
                href={`/${card.type}`}
                className="group block border-2 border-border bg-card p-6 shadow-md hover:shadow-lg hover:translate-x-[-2px] hover:translate-y-[-2px] active:shadow-2xs active:translate-x-[2px] active:translate-y-[2px] transition-all"
              >
                <div className="text-muted-foreground group-hover:text-foreground transition-colors mb-4">
                  {card.icon}
                </div>
                <h2 className="text-lg font-black uppercase tracking-tight mb-1">
                  {config.label}
                </h2>
                <p className="text-xs text-muted-foreground mb-3">
                  {card.description}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-secondary text-secondary-foreground border-2 border-border px-1.5 py-0.5">
                    {card.boardCount}개 게시판
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      <footer className="mt-12 pt-3 border-t-2 border-border text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          모니터링할 방 유형을 선택하세요
        </p>
      </footer>
    </div>
  );
}
