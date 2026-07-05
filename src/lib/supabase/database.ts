import { createClient } from "./server";
import { StoredData, BoardArticles, Article } from "../types";
import { RoomType } from "../constants";

// =====================================================
// Types
// =====================================================

export type SeenMap = Record<number, number>;
export type BookmarkMap = Record<number, number>;

export interface RoomDataBundle {
  boards: BoardArticles[];
  seen: SeenMap;
  bookmarks: BookmarkMap;
  lastUpdated: string | null;
}

interface RoomDataRPCResponse {
  boards: BoardArticles[];
  seen: Record<string, number>;
  bookmarks: Record<string, number>;
  lastUpdated: string | null;
}

// =====================================================
// 페이지 로드용: 단일 RPC 호출로 모든 초기 데이터 반환
// =====================================================

export async function getRoomDataBundle(
  roomType: RoomType
): Promise<RoomDataBundle> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_room_data", {
    p_room_type: roomType,
  });

  if (error) {
    console.error("get_room_data RPC error:", error);
    return { boards: [], seen: {}, bookmarks: {}, lastUpdated: null };
  }

  const payload = (data ?? {}) as RoomDataRPCResponse;

  return {
    boards: payload.boards ?? [],
    seen: keyToNumberMap(payload.seen),
    bookmarks: keyToNumberMap(payload.bookmarks),
    lastUpdated: payload.lastUpdated ?? null,
  };
}

function keyToNumberMap(obj: Record<string, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    out[Number(k)] = v;
  }
  return out;
}

// =====================================================
// 크롤링용: 기존 boards 로딩 (seen/bookmarks 불필요)
// =====================================================

export async function loadStoredDataFromSupabase(
  roomType: RoomType
): Promise<StoredData | null> {
  const supabase = await createClient();

  const { data: boardsData, error: boardsError } = await supabase
    .from("boards")
    .select("menu_id, name, fetched_at")
    .eq("room_type", roomType);

  if (boardsError) {
    console.error("Error loading boards:", boardsError);
    return null;
  }

  if (!boardsData || boardsData.length === 0) {
    return null;
  }

  const { data: articlesData, error: articlesError } = await supabase
    .from("articles")
    .select("*")
    .eq("room_type", roomType)
    .order("write_date_timestamp", { ascending: false });

  if (articlesError) {
    console.error("Error loading articles:", articlesError);
    return null;
  }

  const articlesByMenu = new Map<number, Article[]>();
  for (const a of articlesData || []) {
    const article: Article = {
      articleId: a.article_id,
      menuId: a.menu_id,
      subject: a.subject,
      writerNickname: a.writer_nickname || "",
      writeDateTimestamp: a.write_date_timestamp,
      readCount: a.read_count || 0,
      commentCount: a.comment_count || 0,
      likeItCount: a.like_it_count || 0,
      representImage: a.represent_image || "",
      headName: a.head_name || "",
    };
    if (!articlesByMenu.has(a.menu_id)) {
      articlesByMenu.set(a.menu_id, []);
    }
    articlesByMenu.get(a.menu_id)!.push(article);
  }

  const boards: BoardArticles[] = boardsData.map((b) => ({
    menuId: b.menu_id,
    menuName: b.name,
    articles: articlesByMenu.get(b.menu_id) || [],
    fetchedAt: b.fetched_at || new Date().toISOString(),
  }));

  const { data: metaData } = await supabase
    .from("crawl_metadata")
    .select("last_updated")
    .eq("room_type", roomType)
    .single();

  return {
    boards,
    lastUpdated: metaData?.last_updated || new Date().toISOString(),
  };
}

/**
 * boards의 fetched_at 갱신 + articles upsert + crawl_metadata 갱신.
 *
 * 중요: data.boards에는 "이번에 새로 수집한 글만" 넘긴다. 과거 글은 이미 DB에
 * 있으므로 다시 쓰지 않는다(매번 전체 재저장 시 데이터에 비례해 느려짐).
 * metadata의 total_articles는 별도 인자 totalArticles로 받는다.
 */
export async function saveDataToSupabase(
  roomType: RoomType,
  data: StoredData,
  totalArticles?: number
): Promise<void> {
  const supabase = await createClient();

  for (const board of data.boards) {
    await supabase
      .from("boards")
      .update({ fetched_at: board.fetchedAt })
      .eq("menu_id", board.menuId);

    const articlesToUpsert = board.articles.map((a) => ({
      article_id: a.articleId,
      menu_id: a.menuId,
      room_type: roomType,
      subject: a.subject,
      writer_nickname: a.writerNickname,
      write_date_timestamp: a.writeDateTimestamp,
      read_count: a.readCount,
      comment_count: a.commentCount,
      like_it_count: a.likeItCount,
      represent_image: a.representImage,
      head_name: a.headName,
    }));

    if (articlesToUpsert.length > 0) {
      const { error } = await supabase
        .from("articles")
        .upsert(articlesToUpsert, { onConflict: "article_id" });

      if (error) {
        console.error("Error upserting articles:", error);
      }
    }
  }

  const metadataTotal =
    totalArticles ??
    data.boards.reduce((sum, b) => sum + b.articles.length, 0);
  await supabase
    .from("crawl_metadata")
    .upsert(
      {
        room_type: roomType,
        last_updated: data.lastUpdated,
        total_articles: metadataTotal,
      },
      { onConflict: "room_type" }
    );
}

// =====================================================
// 통합 북마크 조회: 모든 룸 타입의 북마크를 한 번에
// =====================================================

export interface BookmarkItem {
  articleId: number;
  menuId: number;
  menuName: string;
  shortName: string;
  roomType: RoomType;
  roomLabel: string;
  subject: string;
  writerNickname: string;
  writeDateTimestamp: number;
  readCount: number;
  commentCount: number;
  likeItCount: number;
  representImage: string;
  headName: string;
  bookmarkedAt: number;
}

export async function getAllBookmarks(): Promise<BookmarkItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_all_bookmarks");

  if (error) {
    console.error("get_all_bookmarks RPC error:", error);
    return [];
  }

  return (data ?? []) as BookmarkItem[];
}

// =====================================================
// Mutations: 모두 RPC 한 번으로 처리
// =====================================================

export async function markArticlesSeen(
  roomType: RoomType,
  ids: number[],
  articles?: { articleId: number; subject: string }[]
): Promise<void> {
  if (ids.length === 0) return;

  const supabase = await createClient();
  const subjectMap = new Map(
    (articles ?? []).map((a) => [a.articleId, a.subject])
  );
  const subjects = ids.map((id) => subjectMap.get(id) ?? null);

  const { error } = await supabase.rpc("mark_articles_seen", {
    p_room_type: roomType,
    p_ids: ids,
    p_subjects: subjects,
  });

  if (error) {
    console.error("mark_articles_seen RPC error:", error);
  }
}

export async function toggleBookmark(
  roomType: RoomType,
  articleId: number
): Promise<{ added: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_bookmark", {
    p_room_type: roomType,
    p_article_id: articleId,
  });

  if (error) {
    console.error("toggle_bookmark RPC error:", error);
    return { added: false };
  }

  return { added: Boolean(data) };
}

export async function autoMarkOldAsSeen(roomType: RoomType): Promise<void> {
  const supabase = await createClient();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { error } = await supabase.rpc("auto_mark_old_as_seen", {
    p_room_type: roomType,
    p_threshold_ms: oneWeekAgo,
  });

  if (error) {
    console.error("auto_mark_old_as_seen RPC error:", error);
  }
}

// =====================================================
// 크롤링 dedup: 새 글 중 기존 seen된 제목과 겹치면 자동 seen
// =====================================================

function normalizeTitle(subject: string): string {
  return subject
    .replace(/\s+/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export async function deduplicateByTitleInSupabase(
  roomType: RoomType,
  newArticles: { articleId: number; subject: string }[]
): Promise<{ deduped: number[] }> {
  if (newArticles.length === 0) return { deduped: [] };

  const supabase = await createClient();

  const { data: titleData } = await supabase
    .from("seen_titles")
    .select("normalized_title")
    .eq("room_type", roomType);

  const titleIndex = new Set<string>(
    (titleData ?? []).map((row) => row.normalized_title)
  );

  const toMarkSeen: number[] = [];
  const dedupSubjects: { articleId: number; subject: string }[] = [];
  const newTitles: { normalized_title: string; article_id: number }[] = [];

  for (const a of newArticles) {
    const key = normalizeTitle(a.subject);
    if (key.length <= 5) continue;
    if (titleIndex.has(key)) {
      toMarkSeen.push(a.articleId);
      dedupSubjects.push(a);
    } else {
      titleIndex.add(key);
      newTitles.push({ normalized_title: key, article_id: a.articleId });
    }
  }

  if (toMarkSeen.length > 0) {
    await markArticlesSeen(roomType, toMarkSeen, dedupSubjects);
  }

  if (newTitles.length > 0) {
    await supabase
      .from("seen_titles")
      .upsert(
        newTitles.map((t) => ({ ...t, room_type: roomType })),
        { onConflict: "room_type,normalized_title" }
      );
  }

  return { deduped: toMarkSeen };
}

// =====================================================
// Merge boards (크롤링)
// =====================================================

export function mergeBoards(
  oldBoards: BoardArticles[],
  newBoards: BoardArticles[]
): BoardArticles[] {
  const oldByMenuId = new Map<number, BoardArticles>();
  for (const ob of oldBoards) {
    oldByMenuId.set(ob.menuId, ob);
  }

  const merged: BoardArticles[] = [];
  const touchedMenuIds = new Set<number>();

  for (const nb of newBoards) {
    touchedMenuIds.add(nb.menuId);
    const existing = oldByMenuId.get(nb.menuId);

    const seen = new Set<number>();
    const combined: Article[] = [];

    for (const a of nb.articles) {
      if (seen.has(a.articleId)) continue;
      seen.add(a.articleId);
      combined.push(a);
    }
    if (existing) {
      for (const a of existing.articles) {
        if (seen.has(a.articleId)) continue;
        seen.add(a.articleId);
        combined.push(a);
      }
    }

    combined.sort((a, b) => b.writeDateTimestamp - a.writeDateTimestamp);

    merged.push({
      menuId: nb.menuId,
      menuName: nb.menuName || existing?.menuName || `메뉴 ${nb.menuId}`,
      articles: combined,
      fetchedAt: nb.fetchedAt,
    });
  }

  for (const ob of oldBoards) {
    if (!touchedMenuIds.has(ob.menuId)) {
      merged.push(ob);
    }
  }

  return merged;
}
