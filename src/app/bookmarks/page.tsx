import { getAllBookmarks } from "@/lib/supabase/database";
import BookmarksOverview from "@/components/feature/BookmarksOverview";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const items = await getAllBookmarks();
  return <BookmarksOverview initialItems={items} />;
}
