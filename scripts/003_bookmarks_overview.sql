-- 003_bookmarks_overview.sql
-- 모든 룸 타입의 북마크를 한 번에 조회 (룸 + 게시판 메타 포함)

CREATE OR REPLACE FUNCTION public.get_all_bookmarks()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(item ORDER BY (item->>'bookmarkedAt')::BIGINT DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT jsonb_build_object(
      'articleId', a.article_id,
      'menuId', a.menu_id,
      'menuName', b.name,
      'shortName', b.short_name,
      'roomType', a.room_type,
      'roomLabel', rt.label,
      'subject', a.subject,
      'writerNickname', COALESCE(a.writer_nickname, ''),
      'writeDateTimestamp', a.write_date_timestamp,
      'readCount', COALESCE(a.read_count, 0),
      'commentCount', COALESCE(a.comment_count, 0),
      'likeItCount', COALESCE(a.like_it_count, 0),
      'representImage', COALESCE(a.represent_image, ''),
      'headName', COALESCE(a.head_name, ''),
      'bookmarkedAt', bm.bookmarked_at
    ) AS item
    FROM public.bookmarks bm
    INNER JOIN public.articles a
      ON a.article_id = bm.article_id AND a.room_type = bm.room_type
    INNER JOIN public.boards b
      ON b.menu_id = a.menu_id
    INNER JOIN public.room_types rt
      ON rt.id = a.room_type
  ) sub;
$$;

-- 인덱스: 북마크 정렬용
CREATE INDEX IF NOT EXISTS idx_bookmarks_bookmarked_at
  ON public.bookmarks(bookmarked_at DESC);
