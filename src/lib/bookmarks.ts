import fs from "fs/promises";
import path from "path";
import { RoomType } from "./constants";

function getDataDir(roomType: RoomType): string {
  return path.join(process.cwd(), "data", roomType);
}

function getBookmarksFile(roomType: RoomType): string {
  return path.join(getDataDir(roomType), "bookmarks.json");
}

// { articleId: timestamp(ms) }
export type BookmarkMap = Record<number, number>;

export async function loadBookmarks(
  roomType: RoomType
): Promise<BookmarkMap> {
  try {
    const raw = await fs.readFile(getBookmarksFile(roomType), "utf-8");
    return JSON.parse(raw) as BookmarkMap;
  } catch {
    return {};
  }
}

export async function saveBookmarks(
  roomType: RoomType,
  bm: BookmarkMap
): Promise<void> {
  await fs.mkdir(getDataDir(roomType), { recursive: true });
  await fs.writeFile(getBookmarksFile(roomType), JSON.stringify(bm), "utf-8");
}

export async function toggleBookmark(
  roomType: RoomType,
  id: number
): Promise<{ bookmarks: BookmarkMap; added: boolean }> {
  const bm = await loadBookmarks(roomType);
  if (bm[id]) {
    delete bm[id];
    await saveBookmarks(roomType, bm);
    return { bookmarks: bm, added: false };
  } else {
    bm[id] = Date.now();
    await saveBookmarks(roomType, bm);
    return { bookmarks: bm, added: true };
  }
}
