"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ROOM_TYPES, RoomType } from "@/lib/constants";

type Status = "idle" | "loading" | "done" | "error";

interface BoardResult {
  totalNew: number;
  totalArticles: number;
}

type ResultMap = Partial<Record<RoomType, BoardResult | { error: string }>>;

const ROOM_ORDER: RoomType[] = ["oneroom", "twothree", "officetel"];

function isError(v: BoardResult | { error: string }): v is { error: string } {
  return (v as { error: string }).error !== undefined;
}

export default function RefreshAllButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<ResultMap>({});

  async function handleRefreshAll() {
    if (status === "loading") return;
    setStatus("loading");
    setResults({});

    const settled = await Promise.allSettled(
      ROOM_ORDER.map(async (rt) => {
        const res = await fetch(`/api/${rt}/crawl`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return { rt, json };
      })
    );

    const next: ResultMap = {};
    let anyError = false;
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      const rt = ROOM_ORDER[i];
      if (s.status === "fulfilled") {
        next[rt] = {
          totalNew: s.value.json?.stats?.totalNew ?? 0,
          totalArticles: s.value.json?.stats?.totalArticles ?? 0,
        };
      } else {
        anyError = true;
        next[rt] = { error: "실패" };
      }
    }

    setResults(next);
    setStatus(anyError ? "error" : "done");
  }

  const isLoading = status === "loading";
  const totalNewSum = Object.values(results).reduce((sum, v) => {
    if (!v || isError(v)) return sum;
    return sum + v.totalNew;
  }, 0);

  return (
    <div className="mb-6">
      <motion.button
        type="button"
        onClick={handleRefreshAll}
        disabled={isLoading}
        whileHover={isLoading ? undefined : { x: -2, y: -2 }}
        whileTap={isLoading ? undefined : { x: 2, y: 2, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="group relative w-full border-2 border-border bg-primary text-primary-foreground shadow-md hover:shadow-lg active:shadow-2xs disabled:cursor-not-allowed disabled:opacity-90 transition-shadow"
      >
        <div className="flex items-center gap-4 px-5 py-4 text-left">
          <motion.div
            animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
            transition={
              isLoading
                ? { repeat: Infinity, duration: 1, ease: "linear" }
                : { duration: 0.3 }
            }
            className="flex-shrink-0 border-2 border-primary-foreground bg-primary-foreground/10 p-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.25}
                d="M4.5 12a7.5 7.5 0 0 1 13.15-4.95L21 9m0 0V4.5M21 9h-4.5M19.5 12a7.5 7.5 0 0 1-13.15 4.95L3 15m0 0v4.5M3 15h4.5"
              />
            </svg>
          </motion.div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base font-black uppercase tracking-tight">
                {isLoading ? "크롤링 중" : "전체 새로고침"}
              </span>
              {status === "done" && totalNewSum > 0 && (
                <motion.span
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="text-[10px] font-black uppercase tracking-widest bg-secondary text-secondary-foreground border-2 border-border px-1.5 py-0.5"
                >
                  +{totalNewSum} NEW
                </motion.span>
              )}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80 mt-0.5">
              {isLoading
                ? "3개 게시판 동시 수집"
                : status === "done"
                ? "최신화 완료"
                : status === "error"
                ? "일부 실패 — 다시 시도"
                : "원룸 · 투쓰리 · 오피스텔 한 번에"}
            </p>
          </div>

          <motion.svg
            animate={isLoading ? { opacity: 0.3 } : { opacity: 1 }}
            className="flex-shrink-0 w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M13 5l7 7-7 7M5 12h15"
            />
          </motion.svg>
        </div>

        {isLoading && (
          <motion.div
            className="absolute inset-x-0 bottom-0 h-1 bg-primary-foreground/30 origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2.5, ease: "easeOut" }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {(status === "done" || status === "error") && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="mt-3 grid grid-cols-3 gap-2"
          >
            {ROOM_ORDER.map((rt, idx) => {
              const r = results[rt];
              const label = ROOM_TYPES[rt].label;
              const errored = r && isError(r);
              const count = r && !isError(r) ? r.totalNew : 0;
              return (
                <motion.div
                  key={rt}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.3 }}
                  className={`border-2 border-border px-3 py-2 ${
                    errored
                      ? "bg-destructive text-destructive-foreground"
                      : count > 0
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  <div className="text-[9px] font-black uppercase tracking-widest opacity-70">
                    {label}
                  </div>
                  <div className="text-sm font-black tabular-nums mt-0.5">
                    {errored ? "실패" : count > 0 ? `+${count} 새 글` : "변화 없음"}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
