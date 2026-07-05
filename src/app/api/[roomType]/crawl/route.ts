import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { crawlByRoomType } from "@/lib/crawler";
import {
  loadStoredDataFromSupabase,
  saveDataToSupabase,
  mergeBoards,
  autoMarkOldAsSeen,
  deduplicateByTitleInSupabase,
} from "@/lib/supabase/database";
import { Article, CrawlResult, CrawlStats } from "@/lib/types";

// 크롤링은 외부 네트워크 + DB 쓰기가 있어 시간이 걸리므로 한도를 명시한다.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const rt = roomType as RoomType;

  try {
    const oldData = await loadStoredDataFromSupabase(rt);

    const knownByMenuId = new Map<number, Set<number>>();
    if (oldData?.boards) {
      for (const b of oldData.boards) {
        knownByMenuId.set(
          b.menuId,
          new Set(b.articles.map((a) => a.articleId))
        );
      }
    }

    const { boards: freshBoards } = await crawlByRoomType(rt, knownByMenuId);
    const now = new Date().toISOString();

    const newArticlesByBoard: Record<number, Article[]> = {};
    for (const fb of freshBoards) {
      newArticlesByBoard[fb.menuId] = [...fb.articles];
    }

    const mergedBoards = mergeBoards(oldData?.boards ?? [], freshBoards);
    const mergedTotal = mergedBoards.reduce(
      (s, b) => s + b.articles.length,
      0
    );

    // 이미 DB에 있는 과거 글은 다시 쓰지 않는다. 신규 글(freshBoards)만 저장하고
    // metadata의 total은 병합 후 전체 개수(mergedTotal)로 넘긴다.
    await saveDataToSupabase(
      rt,
      { boards: freshBoards, lastUpdated: now },
      mergedTotal
    );

    await autoMarkOldAsSeen(rt);

    const newForDedup: { articleId: number; subject: string }[] = [];
    for (const menuId of Object.keys(newArticlesByBoard)) {
      for (const a of newArticlesByBoard[Number(menuId)]) {
        newForDedup.push({ articleId: a.articleId, subject: a.subject });
      }
    }
    const { deduped } = await deduplicateByTitleInSupabase(rt, newForDedup);
    if (deduped.length > 0) {
      const dedupSet = new Set(deduped);
      for (const menuId of Object.keys(newArticlesByBoard)) {
        newArticlesByBoard[Number(menuId)] = newArticlesByBoard[
          Number(menuId)
        ].filter((a) => !dedupSet.has(a.articleId));
      }
    }

    const stats: CrawlStats = {
      totalArticles: mergedBoards.reduce((s, b) => s + b.articles.length, 0),
      totalNew: Object.values(newArticlesByBoard).reduce(
        (s, arr) => s + arr.length,
        0
      ),
      perBoard: mergedBoards.map((b) => ({
        menuId: b.menuId,
        total: b.articles.length,
        new: (newArticlesByBoard[b.menuId] ?? []).length,
      })),
    };

    const result: CrawlResult = {
      boards: mergedBoards,
      newArticles: newArticlesByBoard,
      lastUpdated: now,
      stats,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
