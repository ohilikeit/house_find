import { createClient } from "./server";
import { StoredData, BoardArticles, Article } from "../types";
import { RoomType } from "../constants";

// =====================================================
// Articles & Boards
// =====================================================

export async function loadStoredDataFromSupabase(
  roomType: RoomType
): Promise<StoredData | null> {
  const supabase = await createClient();

  // Get boards for this room type
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

  // Get all articles for this room type
  const { data: articlesData, error: articlesError } = await supabase
    .from("articles")
    .select("*")
    .eq("room_type", roomType)
    .order("write_date_timestamp", { ascending: false });

  if (articlesError) {
    console.error("Error loading articles:", articlesError);
    return null;
  }

  // Group articles by menu_id
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

  // Build boards array
  const boards: BoardArticles[] = boardsData.map((b) => ({
    menuId: b.menu_id,
    menuName: b.name,
    articles: articlesByMenu.get(b.menu_id) || [],
    fetchedAt: b.fetched_at || new Date().toISOString(),
  }));

  // Get last updated time from crawl_metadata
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

export async function saveDataToSupabase(
  roomType: RoomType,
  data: StoredData
): Promise<void> {
  const supabase = await createClient();

  // Upsert articles
  for (const board of data.boards) {
    // Update board fetched_at
    await supabase
      .from("boards")
      .update({ fetched_at: board.fetchedAt })
      .eq("menu_id", board.menuId);

    // Upsert articles
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

  // Update crawl metadata
  const totalArticles = data.boards.reduce(
    (sum, b) => sum + b.articles.length,
    0
  );
  await supabase
    .from("crawl_metadata")
    .upsert(
      {
        room_type: roomType,
        last_updated: data.lastUpdated,
        total_articles: totalArticles,
      },
      { onConflict: "room_type" }
    );
}

// =====================================================
// Seen Articles
// =====================================================

export type SeenMap = Record<number, number>;

export async function loadSeenFromSupabase(
  roomType: RoomType
): Promise<SeenMap> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seen_articles")
    .select("article_id, seen_at")
    .eq("room_type", roomType);

  if (error) {
    console.error("Error loading seen:", error);
    return {};
  }

  const seen: SeenMap = {};
  for (const row of data || []) {
    seen[row.article_id] = row.seen_at;
  }
  return seen;
}

export async function saveSeenToSupabase(
  roomType: RoomType,
  articleIds: number[],
  timestamp: number
): Promise<void> {
  const supabase = await createClient();

  const rows = articleIds.map((id) => ({
    article_id: id,
    room_type: roomType,
    seen_at: timestamp,
  }));

  if (rows.length > 0) {
    await supabase
      .from("seen_articles")
      .upsert(rows, { onConflict: "article_id,room_type" });
  }
}

export async function markArticlesSeenInSupabase(
  roomType: RoomType,
  ids: number[],
  articles?: { articleId: number; subject: string }[]
): Promise<SeenMap> {
  const supabase = await createClient();
  const now = Date.now();

  // Get existing seen
  const seen = await loadSeenFromSupabase(roomType);

  // Mark new ones as seen
  const newIds = ids.filter((id) => !seen[id]);
  if (newIds.length > 0) {
    await saveSeenToSupabase(roomType, newIds, now);
    for (const id of newIds) {
      seen[id] = now;
    }
  }

  // Save title index
  if (articles) {
    const titleRows = articles
      .filter((a) => {
        const key = normalizeTitle(a.subject);
        return key.length > 5;
      })
      .map((a) => ({
        room_type: roomType,
        normalized_title: normalizeTitle(a.subject),
        article_id: a.articleId,
      }));

    if (titleRows.length > 0) {
      await supabase
        .from("seen_titles")
        .upsert(titleRows, { onConflict: "room_type,normalized_title" });
    }
  }

  return seen;
}

function normalizeTitle(subject: string): string {
  return subject
    .replace(/\s+/g, "")
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export async function autoMarkOldAsSeenInSupabase(
  roomType: RoomType,
  allArticles: {
    articleId: number;
    writeDateTimestamp: number;
    subject?: string;
  }[]
): Promise<SeenMap> {
  const seen = await loadSeenFromSupabase(roomType);
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const oldUnseen = allArticles.filter(
    (a) => a.writeDateTimestamp < oneWeekAgo && !seen[a.articleId]
  );

  if (oldUnseen.length > 0) {
    const supabase = await createClient();

    // Mark old articles as seen with their original timestamp
    const rows = oldUnseen.map((a) => ({
      article_id: a.articleId,
      room_type: roomType,
      seen_at: a.writeDateTimestamp,
    }));

    await supabase
      .from("seen_articles")
      .upsert(rows, { onConflict: "article_id,room_type" });

    for (const a of oldUnseen) {
      seen[a.articleId] = a.writeDateTimestamp;
    }

    // Save titles to index
    const titleRows = oldUnseen
      .filter((a) => a.subject && normalizeTitle(a.subject).length > 5)
      .map((a) => ({
        room_type: roomType,
        normalized_title: normalizeTitle(a.subject!),
        article_id: a.articleId,
      }));

    if (titleRows.length > 0) {
      await supabase
        .from("seen_titles")
        .upsert(titleRows, { onConflict: "room_type,normalized_title" });
    }
  }

  return seen;
}

export async function deduplicateByTitleInSupabase(
  roomType: RoomType,
  newArticles: { articleId: number; subject: string }[]
): Promise<{ seen: SeenMap; deduped: number[] }> {
  const supabase = await createClient();
  const seen = await loadSeenFromSupabase(roomType);
  const deduped: number[] = [];
  const now = Date.now();

  // Get existing title index
  const { data: titleData } = await supabase
    .from("seen_titles")
    .select("normalized_title, article_id")
    .eq("room_type", roomType);

  const titleIndex = new Map<string, number>();
  for (const row of titleData || []) {
    titleIndex.set(row.normalized_title, row.article_id);
  }

  // Find duplicates
  const toMarkSeen: number[] = [];
  for (const a of newArticles) {
    if (seen[a.articleId]) continue;
    const key = normalizeTitle(a.subject);
    if (key.length > 5 && titleIndex.has(key)) {
      toMarkSeen.push(a.articleId);
      deduped.push(a.articleId);
      seen[a.articleId] = now;
    }
  }

  if (toMarkSeen.length > 0) {
    await saveSeenToSupabase(roomType, toMarkSeen, now);
  }

  // Add new titles to index
  const newTitles = newArticles
    .filter((a) => {
      const key = normalizeTitle(a.subject);
      return key.length > 5 && !titleIndex.has(key);
    })
    .map((a) => ({
      room_type: roomType,
      normalized_title: normalizeTitle(a.subject),
      article_id: a.articleId,
    }));

  if (newTitles.length > 0) {
    await supabase
      .from("seen_titles")
      .upsert(newTitles, { onConflict: "room_type,normalized_title" });
  }

  return { seen, deduped };
}

// =====================================================
// Bookmarks
// =====================================================

export type BookmarkMap = Record<number, number>;

export async function loadBookmarksFromSupabase(
  roomType: RoomType
): Promise<BookmarkMap> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookmarks")
    .select("article_id, bookmarked_at")
    .eq("room_type", roomType);

  if (error) {
    console.error("Error loading bookmarks:", error);
    return {};
  }

  const bookmarks: BookmarkMap = {};
  for (const row of data || []) {
    bookmarks[row.article_id] = row.bookmarked_at;
  }
  return bookmarks;
}

export async function toggleBookmarkInSupabase(
  roomType: RoomType,
  articleId: number
): Promise<{ bookmarks: BookmarkMap; added: boolean }> {
  const supabase = await createClient();
  const bookmarks = await loadBookmarksFromSupabase(roomType);

  if (bookmarks[articleId]) {
    // Remove bookmark
    await supabase
      .from("bookmarks")
      .delete()
      .eq("article_id", articleId)
      .eq("room_type", roomType);

    delete bookmarks[articleId];
    return { bookmarks, added: false };
  } else {
    // Add bookmark
    const now = Date.now();
    await supabase.from("bookmarks").upsert(
      {
        article_id: articleId,
        room_type: roomType,
        bookmarked_at: now,
      },
      { onConflict: "article_id,room_type" }
    );

    bookmarks[articleId] = now;
    return { bookmarks, added: true };
  }
}

// =====================================================
// Merge Boards (same logic as before)
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
