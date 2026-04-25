import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { loadBookmarks, toggleBookmark } from "@/lib/bookmarks";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const bookmarks = await loadBookmarks(roomType as RoomType);
  return NextResponse.json({ bookmarks });
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
  const { id } = body as { id: number };

  const result = await toggleBookmark(roomType as RoomType, id);
  return NextResponse.json(result);
}
