import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import {
  loadSeenFromSupabase,
  markArticlesSeenInSupabase,
} from "@/lib/supabase/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const seen = await loadSeenFromSupabase(roomType as RoomType);
  return NextResponse.json({ seen });
}

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

  const seen = await markArticlesSeenInSupabase(
    roomType as RoomType,
    ids,
    articles
  );
  return NextResponse.json({ seen });
}
