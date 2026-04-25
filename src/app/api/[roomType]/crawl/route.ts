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

    await saveDataToSupabase(rt, {
      boards: mergedBoards,
      lastUpdated: now,
    });

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
