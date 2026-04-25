import fs from "fs/promises";
import path from "path";
import { StoredData, BoardArticles, Article } from "./types";
import { RoomType } from "./constants";

function getDataDir(roomType: RoomType): string {
  return path.join(process.cwd(), "data", roomType);
}

function getDataFile(roomType: RoomType): string {
  return path.join(getDataDir(roomType), "articles.json");
}

export { getDataDir };

export async function loadStoredData(
  roomType: RoomType
): Promise<StoredData | null> {
  try {
    const raw = await fs.readFile(getDataFile(roomType), "utf-8");
    return JSON.parse(raw) as StoredData;
  } catch {
    return null;
  }
}

export async function saveData(
  roomType: RoomType,
  data: StoredData
): Promise<void> {
  await fs.mkdir(getDataDir(roomType), { recursive: true });
  await fs.writeFile(
    getDataFile(roomType),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

/**
 * 기존 boards에 새로 크롤한 boards를 병합.
 * - articleId 기준 dedup
 * - writeDateTimestamp DESC 정렬 (최신 우선)
 * - menuName 등 메타데이터는 최신 값으로 갱신
 * - 새 크롤에 없는 기존 보드도 그대로 보존
 */
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
