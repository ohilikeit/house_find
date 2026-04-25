import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { crawlByRoomType } from "@/lib/crawler";
import { loadStoredData, saveData, mergeBoards } from "@/lib/storage";
import { autoMarkOldAsSeen, deduplicateByTitle } from "@/lib/seen";
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
    const oldData = await loadStoredData(rt);

    // 저장된 글의 articleId 맵 → "이후"의 기준선
    const knownByMenuId = new Map<number, Set<number>>();
    if (oldData?.boards) {
      for (const b of oldData.boards) {
        knownByMenuId.set(
          b.menuId,
          new Set(b.articles.map((a) => a.articleId))
        );
      }
    }

    // 기준선 이후의 새 글만 수집 (페이지네이션 자동 확장)
    const { boards: freshBoards } = await crawlByRoomType(rt, knownByMenuId);
    const now = new Date().toISOString();

    // 병합 전 "순수 신규"를 보드별로 저장 (통계·알림용)
    const newArticlesByBoard: Record<number, Article[]> = {};
    for (const fb of freshBoards) {
      newArticlesByBoard[fb.menuId] = [...fb.articles];
    }

    // 기존 저장본과 병합해 누적
    const mergedBoards = mergeBoards(oldData?.boards ?? [], freshBoards);

    await saveData(rt, {
      boards: mergedBoards,
      lastUpdated: now,
    });

    // 7일 이상 된 글 자동 읽음 처리 + 제목 인덱스 구축
    const allArticles = mergedBoards.flatMap((b) =>
      b.articles.map((a) => ({
        articleId: a.articleId,
        writeDateTimestamp: a.writeDateTimestamp,
        subject: a.subject,
      }))
    );
    await autoMarkOldAsSeen(rt, allArticles);

    // 새 글 중 제목이 이미 seen된 글과 겹치는 재업로드는 자동 seen
    const newForDedup: { articleId: number; subject: string }[] = [];
    for (const menuId of Object.keys(newArticlesByBoard)) {
      for (const a of newArticlesByBoard[Number(menuId)]) {
        newForDedup.push({ articleId: a.articleId, subject: a.subject });
      }
    }
    const { deduped } = await deduplicateByTitle(rt, newForDedup);
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
