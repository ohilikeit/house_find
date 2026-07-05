import {
  CAFE_ID,
  NAVER_API_BASE,
  HEADERS,
  BoardConfig,
  RoomType,
  ROOM_TYPES,
} from "./constants";
import { Article, BoardArticles } from "./types";

interface NaverArticle {
  articleId: number;
  menuId: number;
  subject: string;
  writerNickname: string;
  writeDateTimestamp: number;
  readCount: number;
  commentCount: number;
  likeItCount: number;
  representImage: string;
  headName: string;
}

// 네이버 카페 API 실질 상한 (요청과 무관하게 50이 최대치로 관측됨)
const PER_PAGE = 50;
// 페이지/보드 사이 딜레이 (rate limiting 방지)
const DELAY_MS = 800;
// 개별 네이버 요청 타임아웃 (응답이 없으면 함수 전체가 멈추는 것을 방지)
const FETCH_TIMEOUT_MS = 8000;

function toArticle(raw: NaverArticle): Article {
  return {
    articleId: raw.articleId,
    menuId: raw.menuId,
    subject: raw.subject,
    writerNickname: raw.writerNickname,
    writeDateTimestamp: raw.writeDateTimestamp,
    readCount: raw.readCount,
    commentCount: raw.commentCount,
    likeItCount: raw.likeItCount,
    representImage: raw.representImage || "",
    headName: raw.headName || "",
  };
}

async function fetchPage(
  menuId: number,
  page: number
): Promise<NaverArticle[]> {
  const params = new URLSearchParams({
    "search.clubid": String(CAFE_ID),
    "search.menuid": String(menuId),
    "search.boardtype": "L",
    "search.page": String(page),
    "search.perPage": String(PER_PAGE),
  });

  const url = `${NAVER_API_BASE}?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Timeout fetching menu ${menuId} page ${page} (>${FETCH_TIMEOUT_MS}ms)`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(
      `Failed to fetch menu ${menuId} page ${page}: ${res.status}`
    );
  }

  const data = await res.json();
  return (data?.message?.result?.articleList ?? []) as NaverArticle[];
}

export interface BoardCrawlStat {
  menuId: number;
  fetchedPages: number;
  newCount: number;
}

/**
 * knownIds에 없는 최신 글만 페이지네이션으로 수집.
 *
 * 종료 조건:
 *   1) 페이지 배치 안에 knownIds 원소가 하나라도 등장 → 그 지점 이전은 모두 이미 저장됨
 *   2) 네이버가 빈 배열 반환 → 보드의 끝
 *   3) 네이버가 PER_PAGE 미만 반환 → 마지막 페이지까지 소진
 *
 * knownIds가 비어 있으면 (첫 크롤) 2·3 조건으로만 종료.
 */
async function crawlBoardSince(
  board: BoardConfig,
  knownIds: Set<number>
): Promise<{ board: BoardArticles; fetchedPages: number }> {
  const collected: Article[] = [];
  let page = 1;
  let fetchedPages = 0;

  while (true) {
    const batch = await fetchPage(board.menuId, page);
    fetchedPages++;

    if (batch.length === 0) break;

    let overlap = false;
    for (const raw of batch) {
      if (knownIds.has(raw.articleId)) {
        overlap = true;
        break;
      }
      collected.push(toArticle(raw));
    }

    if (overlap) break;
    if (batch.length < PER_PAGE) break;

    page++;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return {
    board: {
      menuId: board.menuId,
      menuName: board.name,
      articles: collected,
      fetchedAt: new Date().toISOString(),
    },
    fetchedPages,
  };
}

export async function crawlBoards(
  boards: BoardConfig[],
  knownByMenuId: Map<number, Set<number>>
): Promise<{ boards: BoardArticles[]; stats: BoardCrawlStat[] }> {
  const results: BoardArticles[] = [];
  const stats: BoardCrawlStat[] = [];

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    const knownIds = knownByMenuId.get(board.menuId) ?? new Set<number>();
    const { board: boardData, fetchedPages } = await crawlBoardSince(
      board,
      knownIds
    );
    results.push(boardData);
    stats.push({
      menuId: board.menuId,
      fetchedPages,
      newCount: boardData.articles.length,
    });

    if (i < boards.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return { boards: results, stats };
}

/** 특정 룸 타입의 모든 게시판을 knownIds 이후분만 크롤링 */
export async function crawlByRoomType(
  roomType: RoomType,
  knownByMenuId: Map<number, Set<number>>
): Promise<{ boards: BoardArticles[]; stats: BoardCrawlStat[] }> {
  const config = ROOM_TYPES[roomType];
  return crawlBoards(config.boards, knownByMenuId);
}
