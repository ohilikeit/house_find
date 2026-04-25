import fs from "fs/promises";
import path from "path";
import { RoomType } from "./constants";

function getDataDir(roomType: RoomType): string {
  return path.join(process.cwd(), "data", roomType);
}

function getSeenFile(roomType: RoomType): string {
  return path.join(getDataDir(roomType), "seen.json");
}

function getSeenTitlesFile(roomType: RoomType): string {
  return path.join(getDataDir(roomType), "seen-titles.json");
}

// { articleId: timestamp(ms) }
export type SeenMap = Record<number, number>;
// { normalizedTitle: articleId } - 중복 체크용 제목 인덱스
type TitleIndex = Record<string, number>;

function normalizeTitle(subject: string): string {
  return subject
    .replace(/\s+/g, "")
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export async function loadSeen(roomType: RoomType): Promise<SeenMap> {
  try {
    const raw = await fs.readFile(getSeenFile(roomType), "utf-8");
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

export async function saveSeen(
  roomType: RoomType,
  seen: SeenMap
): Promise<void> {
  await fs.mkdir(getDataDir(roomType), { recursive: true });
  await fs.writeFile(getSeenFile(roomType), JSON.stringify(seen), "utf-8");
}

async function loadTitleIndex(roomType: RoomType): Promise<TitleIndex> {
  try {
    const raw = await fs.readFile(getSeenTitlesFile(roomType), "utf-8");
    return JSON.parse(raw) as TitleIndex;
  } catch {
    return {};
  }
}

async function saveTitleIndex(
  roomType: RoomType,
  index: TitleIndex
): Promise<void> {
  await fs.mkdir(getDataDir(roomType), { recursive: true });
  await fs.writeFile(
    getSeenTitlesFile(roomType),
    JSON.stringify(index),
    "utf-8"
  );
}

export async function markArticlesSeen(
  roomType: RoomType,
  ids: number[],
  articles?: { articleId: number; subject: string }[]
): Promise<SeenMap> {
  const seen = await loadSeen(roomType);
  const titleIndex = await loadTitleIndex(roomType);
  const now = Date.now();

  for (const id of ids) {
    if (!seen[id]) seen[id] = now;
  }

  // 제목 인덱스에도 추가
  if (articles) {
    for (const a of articles) {
      const key = normalizeTitle(a.subject);
      if (key.length > 5) {
        titleIndex[key] = a.articleId;
      }
    }
    await saveTitleIndex(roomType, titleIndex);
  }

  await saveSeen(roomType, seen);
  return seen;
}

export async function autoMarkOldAsSeen(
  roomType: RoomType,
  allArticles: {
    articleId: number;
    writeDateTimestamp: number;
    subject?: string;
  }[]
): Promise<SeenMap> {
  const seen = await loadSeen(roomType);
  const titleIndex = await loadTitleIndex(roomType);
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let changed = false;

  for (const a of allArticles) {
    if (a.writeDateTimestamp < oneWeekAgo && !seen[a.articleId]) {
      seen[a.articleId] = a.writeDateTimestamp;
      changed = true;
    }

    // seen된 글의 제목을 인덱스에 저장
    if (seen[a.articleId] && a.subject) {
      const key = normalizeTitle(a.subject);
      if (key.length > 5) {
        titleIndex[key] = a.articleId;
      }
    }
  }

  if (changed) {
    await saveSeen(roomType, seen);
    await saveTitleIndex(roomType, titleIndex);
  }
  return seen;
}

/** 새 글 중 이미 seen된 글과 제목이 겹치는 것을 자동 seen 처리 */
export async function deduplicateByTitle(
  roomType: RoomType,
  newArticles: { articleId: number; subject: string }[]
): Promise<{ seen: SeenMap; deduped: number[] }> {
  const seen = await loadSeen(roomType);
  const titleIndex = await loadTitleIndex(roomType);
  const deduped: number[] = [];
  const now = Date.now();

  for (const a of newArticles) {
    if (seen[a.articleId]) continue;
    const key = normalizeTitle(a.subject);
    if (key.length > 5 && titleIndex[key]) {
      seen[a.articleId] = now;
      deduped.push(a.articleId);
    }
  }

  if (deduped.length > 0) {
    await saveSeen(roomType, seen);
  }

  // 새 글 제목도 인덱스에 추가
  let indexChanged = false;
  for (const a of newArticles) {
    const key = normalizeTitle(a.subject);
    if (key.length > 5 && !titleIndex[key]) {
      titleIndex[key] = a.articleId;
      indexChanged = true;
    }
  }
  if (indexChanged) await saveTitleIndex(roomType, titleIndex);

  return { seen, deduped };
}
