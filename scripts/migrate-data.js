import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ROOM_TYPES = ["oneroom", "twothree", "officetel"];

async function migrateArticles(roomType) {
  const filePath = path.join(__dirname, "..", "data", roomType, "articles.json");
  
  if (!fs.existsSync(filePath)) {
    console.log(`No articles file for ${roomType}`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const boards = data.boards || [];
  
  let totalInserted = 0;

  for (const board of boards) {
    const articles = board.articles || [];
    
    if (articles.length === 0) continue;

    const articlesToInsert = articles.map((article) => ({
      article_id: article.articleId,
      menu_id: article.menuId,
      room_type: roomType,
      subject: article.subject,
      writer_nickname: article.writerNickname || null,
      write_date_timestamp: article.writeDateTimestamp,
      read_count: article.readCount || 0,
      comment_count: article.commentCount || 0,
      like_it_count: article.likeItCount || 0,
      represent_image: article.representImage || null,
      head_name: article.headName || null,
    }));

    // Insert in batches of 100
    for (let i = 0; i < articlesToInsert.length; i += 100) {
      const batch = articlesToInsert.slice(i, i + 100);
      const { error } = await supabase
        .from("articles")
        .upsert(batch, { onConflict: "article_id" });

      if (error) {
        console.error(`Error inserting articles for ${roomType}:`, error.message);
      } else {
        totalInserted += batch.length;
      }
    }

    // Update board fetched_at
    const { error: boardError } = await supabase
      .from("boards")
      .update({ fetched_at: new Date().toISOString() })
      .eq("menu_id", board.menuId);

    if (boardError) {
      console.error(`Error updating board ${board.menuId}:`, boardError.message);
    }
  }

  console.log(`[${roomType}] Inserted ${totalInserted} articles`);
  return totalInserted;
}

async function migrateSeenArticles(roomType) {
  const filePath = path.join(__dirname, "..", "data", roomType, "seen.json");
  
  if (!fs.existsSync(filePath)) {
    console.log(`No seen file for ${roomType}`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const entries = Object.entries(data);
  
  if (entries.length === 0) return 0;

  const seenToInsert = entries.map(([articleId, seenAt]) => ({
    article_id: parseInt(articleId, 10),
    room_type: roomType,
    seen_at: seenAt,
  }));

  let totalInserted = 0;

  // Insert in batches of 100
  for (let i = 0; i < seenToInsert.length; i += 100) {
    const batch = seenToInsert.slice(i, i + 100);
    const { error } = await supabase
      .from("seen_articles")
      .upsert(batch, { onConflict: "article_id,room_type" });

    if (error) {
      console.error(`Error inserting seen for ${roomType}:`, error.message);
    } else {
      totalInserted += batch.length;
    }
  }

  console.log(`[${roomType}] Inserted ${totalInserted} seen articles`);
  return totalInserted;
}

async function migrateSeenTitles(roomType) {
  const filePath = path.join(__dirname, "..", "data", roomType, "seen-titles.json");
  
  if (!fs.existsSync(filePath)) {
    console.log(`No seen-titles file for ${roomType}`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const entries = Object.entries(data);
  
  if (entries.length === 0) return 0;

  const titlesToInsert = entries.map(([normalizedTitle, articleId]) => ({
    room_type: roomType,
    normalized_title: normalizedTitle,
    article_id: articleId,
  }));

  let totalInserted = 0;

  // Insert in batches of 100
  for (let i = 0; i < titlesToInsert.length; i += 100) {
    const batch = titlesToInsert.slice(i, i + 100);
    const { error } = await supabase
      .from("seen_titles")
      .upsert(batch, { onConflict: "room_type,normalized_title" });

    if (error) {
      console.error(`Error inserting seen titles for ${roomType}:`, error.message);
    } else {
      totalInserted += batch.length;
    }
  }

  console.log(`[${roomType}] Inserted ${totalInserted} seen titles`);
  return totalInserted;
}

async function migrateBookmarks(roomType) {
  const filePath = path.join(__dirname, "..", "data", roomType, "bookmarks.json");
  
  if (!fs.existsSync(filePath)) {
    console.log(`No bookmarks file for ${roomType}`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const entries = Object.entries(data);
  
  if (entries.length === 0) return 0;

  const bookmarksToInsert = entries.map(([articleId, bookmarkedAt]) => ({
    article_id: parseInt(articleId, 10),
    room_type: roomType,
    bookmarked_at: bookmarkedAt,
  }));

  let totalInserted = 0;

  // Insert in batches of 100
  for (let i = 0; i < bookmarksToInsert.length; i += 100) {
    const batch = bookmarksToInsert.slice(i, i + 100);
    const { error } = await supabase
      .from("bookmarks")
      .upsert(batch, { onConflict: "article_id,room_type" });

    if (error) {
      console.error(`Error inserting bookmarks for ${roomType}:`, error.message);
    } else {
      totalInserted += batch.length;
    }
  }

  console.log(`[${roomType}] Inserted ${totalInserted} bookmarks`);
  return totalInserted;
}

async function updateCrawlMetadata(roomType, totalArticles) {
  const { error } = await supabase
    .from("crawl_metadata")
    .update({
      last_updated: new Date().toISOString(),
      total_articles: totalArticles,
    })
    .eq("room_type", roomType);

  if (error) {
    console.error(`Error updating crawl metadata for ${roomType}:`, error.message);
  }
}

async function main() {
  console.log("Starting data migration to Supabase...\n");

  for (const roomType of ROOM_TYPES) {
    console.log(`\n=== Migrating ${roomType} ===`);
    
    const articlesCount = await migrateArticles(roomType);
    await migrateSeenArticles(roomType);
    await migrateSeenTitles(roomType);
    await migrateBookmarks(roomType);
    await updateCrawlMetadata(roomType, articlesCount);
  }

  console.log("\n=== Migration completed! ===");
}

main().catch(console.error);
