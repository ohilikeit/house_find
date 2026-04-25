import { NextResponse } from "next/server";
import { isValidRoomType, RoomType } from "@/lib/constants";
import { getRoomDataBundle } from "@/lib/supabase/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomType: string }> }
) {
  const { roomType } = await params;

  if (!isValidRoomType(roomType)) {
    return NextResponse.json({ error: "Invalid room type" }, { status: 400 });
  }

  const bundle = await getRoomDataBundle(roomType as RoomType);
  return NextResponse.json(bundle);
}
