-- 002_optimize.sql
-- 페이지 로드 성능 최적화: 단일 RPC 호출로 모든 초기 데이터를 반환

-- =====================================================
-- 추가 복합 인덱스 (room_type + write_date_timestamp DESC 정렬용)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_articles_room_write_date
  ON public.articles(room_type, write_date_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_articles_menu_write_date
  ON public.articles(menu_id, write_date_timestamp DESC);

-- =====================================================
-- get_room_data(p_room_type)
-- 한 번의 RPC 호출로 boards + articles + seen + bookmarks + lastUpdated 반환
-- 응답 모양은 클라이언트가 그대로 사용할 수 있도록 camelCase JSON
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_room_data(p_room_type TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'boards', COALESCE((
      SELECT jsonb_agg(board_obj ORDER BY menu_id)
      FROM (
        SELECT
          b.menu_id,
          jsonb_build_object(
            'menuId', b.menu_id,
            'menuName', b.name,
            'fetchedAt', b.fetched_at,
            'articles', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'articleId', a.article_id,
                  'menuId', a.menu_id,
                  'subject', a.subject,
                  'writerNickname', COALESCE(a.writer_nickname, ''),
                  'writeDateTimestamp', a.write_date_timestamp,
                  'readCount', COALESCE(a.read_count, 0),
                  'commentCount', COALESCE(a.comment_count, 0),
                  'likeItCount', COALESCE(a.like_it_count, 0),
                  'representImage', COALESCE(a.represent_image, ''),
                  'headName', COALESCE(a.head_name, '')
                ) ORDER BY a.write_date_timestamp DESC
              )
              FROM public.articles a
              WHERE a.menu_id = b.menu_id
                AND a.room_type = p_room_type
            ), '[]'::jsonb)
          ) AS board_obj
        FROM public.boards b
        WHERE b.room_type = p_room_type
      ) sub
    ), '[]'::jsonb),
    'seen', COALESCE((
      SELECT jsonb_object_agg(article_id::text, seen_at)
      FROM public.seen_articles
      WHERE room_type = p_room_type
    ), '{}'::jsonb),
    'bookmarks', COALESCE((
      SELECT jsonb_object_agg(article_id::text, bookmarked_at)
      FROM public.bookmarks
      WHERE room_type = p_room_type
    ), '{}'::jsonb),
    'lastUpdated', (
      SELECT last_updated::text
      FROM public.crawl_metadata
      WHERE room_type = p_room_type
    )
  );
$$;

-- =====================================================
-- auto_mark_old_as_seen(p_room_type, p_threshold_ms)
-- 1주일 이상 된 unseen 글을 한 번의 INSERT로 seen 처리
-- 크롤링 후에만 호출 (페이지 로드 시 호출 금지)
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_mark_old_as_seen(
  p_room_type TEXT,
  p_threshold_ms BIGINT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH ins AS (
    INSERT INTO public.seen_articles (article_id, room_type, seen_at)
    SELECT a.article_id, p_room_type, a.write_date_timestamp
    FROM public.articles a
    WHERE a.room_type = p_room_type
      AND a.write_date_timestamp < p_threshold_ms
    ON CONFLICT (article_id, room_type) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  -- seen된 모든 글의 제목 인덱스 동기화 (dedup용)
  INSERT INTO public.seen_titles (room_type, normalized_title, article_id)
  SELECT
    p_room_type,
    LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(a.subject, '\s+', '', 'g'),
        '[^가-힣a-zA-Z0-9]', '', 'g'
      )
    ) AS normalized_title,
    a.article_id
  FROM public.articles a
  INNER JOIN public.seen_articles s
    ON s.article_id = a.article_id AND s.room_type = a.room_type
  WHERE a.room_type = p_room_type
    AND LENGTH(
      LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(a.subject, '\s+', '', 'g'),
          '[^가-힣a-zA-Z0-9]', '', 'g'
        )
      )
    ) > 5
  ON CONFLICT (room_type, normalized_title) DO NOTHING;

  RETURN v_count;
END;
$$;

-- =====================================================
-- mark_articles_seen(p_room_type, p_ids[], p_subjects[])
-- 클라이언트의 "확인" 액션을 한 번의 RPC로 처리
-- p_ids 와 p_subjects 는 같은 인덱스 정렬 (subject 가 NULL 이면 제목 인덱스 skip)
-- =====================================================
CREATE OR REPLACE FUNCTION public.mark_articles_seen(
  p_room_type TEXT,
  p_ids BIGINT[],
  p_subjects TEXT[] DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_now BIGINT;
BEGIN
  v_now := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

  INSERT INTO public.seen_articles (article_id, room_type, seen_at)
  SELECT unnest(p_ids), p_room_type, v_now
  ON CONFLICT (article_id, room_type) DO NOTHING;

  IF p_subjects IS NOT NULL AND array_length(p_subjects, 1) > 0 THEN
    INSERT INTO public.seen_titles (room_type, normalized_title, article_id)
    SELECT
      p_room_type,
      LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(s.subject, '\s+', '', 'g'),
          '[^가-힣a-zA-Z0-9]', '', 'g'
        )
      ) AS normalized_title,
      s.aid
    FROM (
      SELECT
        unnest(p_ids) AS aid,
        unnest(p_subjects) AS subject
    ) s
    WHERE s.subject IS NOT NULL
      AND LENGTH(
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(s.subject, '\s+', '', 'g'),
            '[^가-힣a-zA-Z0-9]', '', 'g'
          )
        )
      ) > 5
    ON CONFLICT (room_type, normalized_title) DO NOTHING;
  END IF;
END;
$$;

-- =====================================================
-- toggle_bookmark(p_room_type, p_article_id)
-- 북마크 토글을 SELECT 없이 단일 트랜잭션으로 처리
-- returns: TRUE = added, FALSE = removed
-- =====================================================
CREATE OR REPLACE FUNCTION public.toggle_bookmark(
  p_room_type TEXT,
  p_article_id BIGINT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_existed BOOLEAN;
BEGIN
  WITH del AS (
    DELETE FROM public.bookmarks
    WHERE article_id = p_article_id AND room_type = p_room_type
    RETURNING 1
  )
  SELECT EXISTS(SELECT 1 FROM del) INTO v_existed;

  IF v_existed THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.bookmarks (article_id, room_type, bookmarked_at)
  VALUES (p_article_id, p_room_type, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
  ON CONFLICT (article_id, room_type) DO NOTHING;
  RETURN TRUE;
END;
$$;
