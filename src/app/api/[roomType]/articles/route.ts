import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { loadStoredData } from "@/lib/storage";
import { autoMarkOldAsSeen } from "@/lib/seen";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const data = await loadStoredData(roomType as RoomType);

  if (!data) {
    return NextResponse.json({ boards: [], lastUpdated: null });
  }

  // 1주일 이상 된 글 자동 읽음 처리 + 제목 인덱스 구축
  const allArticles = data.boards.flatMap((b) =>
    b.articles.map((a) => ({
      articleId: a.articleId,
      writeDateTimestamp: a.writeDateTimestamp,
      subject: a.subject,
    }))
  );
  await autoMarkOldAsSeen(roomType as RoomType, allArticles);

  return NextResponse.json(data);
}
