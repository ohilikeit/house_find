import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { markArticlesSeen } from "@/lib/supabase/database";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const body = await request.json();
  const { ids, articles } = body as {
    ids: number[];
    articles?: { articleId: number; subject: string }[];
  };

  await markArticlesSeen(roomType as RoomType, ids, articles);
  return NextResponse.json({ ok: true });
}
