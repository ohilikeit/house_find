import { NextResponse } from "next/server";
import { getAllBookmarks } from "@/lib/supabase/database";

export async function GET() {
  const items = await getAllBookmarks();
  return NextResponse.json({ items, totalCount: items.length });
}
