export interface BoardConfig {
  menuId: number;
  name: string;
  shortName: string;
}

export type RoomType = "oneroom" | "twothree" | "officetel";

export interface RoomTypeConfig {
  label: string;
  subtitle: string;
  boards: BoardConfig[];
}

export const ROOM_TYPES: Record<RoomType, RoomTypeConfig> = {
  oneroom: {
    label: "원룸",
    subtitle: "원룸 새 글 모니터",
    boards: [
      { menuId: 4, name: "[원룸]서대문·은평구", shortName: "서대문·은평" },
      { menuId: 5, name: "[원룸]마포구", shortName: "마포" },
      {
        menuId: 6,
        name: "[원룸]중구·종로·성북·구로·금천",
        shortName: "중구·종로·성북",
      },
      {
        menuId: 51,
        name: "[원룸]동작·관악·서초·강남",
        shortName: "광진구·중랑구",
      },
      {
        menuId: 7,
        name: "[원룸]강북·노원·도봉·중랑·동대문·성북",
        shortName: "강북·노원·도봉",
      },
      {
        menuId: 69,
        name: "[원룸]동대문·성동구·도봉·노원",
        shortName: "동대문·성동구",
      },
    ],
  },
  twothree: {
    label: "투쓰리룸",
    subtitle: "투쓰리룸 새 글 모니터",
    boards: [
      {
        menuId: 76,
        name: "[투쓰리룸]성북/성동/광진/용산",
        shortName: "성북·성동·광진·용산",
      },
      {
        menuId: 77,
        name: "[투쓰리룸]중랑/강북/노원/도봉",
        shortName: "중랑·강북·노원·도봉",
      },
      {
        menuId: 75,
        name: "[투쓰리룸]중구/종로/동대문",
        shortName: "중구·종로·동대문",
      },
      {
        menuId: 74,
        name: "[투쓰리룸]마포/은평/서대문",
        shortName: "마포·은평·서대문",
      },
    ],
  },
  officetel: {
    label: "오피스텔",
    subtitle: "오피스텔 새 글 모니터",
    boards: [
      { menuId: 289, name: "[오피스텔]월세/서울", shortName: "월세·서울" },
    ],
  },
};

// 하위 호환성: 기존 코드에서 BOARDS를 참조하는 곳 대응
export const BOARDS = ROOM_TYPES.oneroom.boards;

export const CAFE_ID = 10322296;
export const CAFE_NAME = "피터팬의 좋은방 구하기";

export const NAVER_API_BASE =
  "https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json";

export const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Accept-Language": "ko-KR,ko;q=0.9",
  Referer: "https://cafe.naver.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export const VALID_ROOM_TYPES: RoomType[] = ["oneroom", "twothree", "officetel"];

export function isValidRoomType(value: string): value is RoomType {
  return VALID_ROOM_TYPES.includes(value as RoomType);
}
