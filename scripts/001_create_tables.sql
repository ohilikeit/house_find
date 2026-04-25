-- 001_create_tables.sql
-- House Find 앱을 위한 Supabase 테이블 생성

-- =====================================================
-- 1. room_types 테이블 (방 타입 정의)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.room_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 방 타입 데이터 삽입
INSERT INTO public.room_types (id, label, subtitle) VALUES
  ('oneroom', '원룸', '원룸 새 글 모니터'),
  ('twothree', '투쓰리룸', '투쓰리룸 새 글 모니터'),
  ('officetel', '오피스텔', '오피스텔 새 글 모니터')
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 2. boards 테이블 (게시판 정의)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.boards (
  menu_id INTEGER PRIMARY KEY,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 게시판 데이터 삽입
INSERT INTO public.boards (menu_id, room_type, name, short_name) VALUES
  -- 원룸
  (4, 'oneroom', '[원룸]서대문·은평구', '서대문·은평'),
  (5, 'oneroom', '[원룸]마포구', '마포'),
  (6, 'oneroom', '[원룸]중구·종로·성북·구로·금천', '중구·종로·성북'),
  (51, 'oneroom', '[원룸]동작·관악·서초·강남', '광진구·중랑구'),
  (7, 'oneroom', '[원룸]강북·노원·도봉·중랑·동대문·성북', '강북·노원·도봉'),
  (69, 'oneroom', '[원룸]동대문·성동구·도봉·노원', '동대문·성동구'),
  -- 투쓰리룸
  (76, 'twothree', '[투쓰리룸]성북/성동/광진/용산', '성북·성동·광진·용산'),
  (77, 'twothree', '[투쓰리룸]중랑/강북/노원/도봉', '중랑·강북·노원·도봉'),
  (75, 'twothree', '[투쓰리룸]중구/종로/동대문', '중구·종로·동대문'),
  (74, 'twothree', '[투쓰리룸]마포/은평/서대문', '마포·은평·서대문'),
  -- 오피스텔
  (289, 'officetel', '[오피스텔]월세/서울', '월세·서울')
ON CONFLICT (menu_id) DO NOTHING;

-- =====================================================
-- 3. articles 테이블 (게시글/매물 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.articles (
  article_id BIGINT PRIMARY KEY,
  menu_id INTEGER NOT NULL REFERENCES public.boards(menu_id) ON DELETE CASCADE,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  writer_nickname TEXT,
  write_date_timestamp BIGINT NOT NULL,
  read_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  like_it_count INTEGER DEFAULT 0,
  represent_image TEXT,
  head_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_articles_room_type ON public.articles(room_type);
CREATE INDEX IF NOT EXISTS idx_articles_menu_id ON public.articles(menu_id);
CREATE INDEX IF NOT EXISTS idx_articles_write_date ON public.articles(write_date_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_articles_room_menu ON public.articles(room_type, menu_id);

-- =====================================================
-- 4. seen_articles 테이블 (읽음 표시)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.seen_articles (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  seen_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, room_type)
);

CREATE INDEX IF NOT EXISTS idx_seen_room_type ON public.seen_articles(room_type);
CREATE INDEX IF NOT EXISTS idx_seen_article_id ON public.seen_articles(article_id);

-- =====================================================
-- 5. seen_titles 테이블 (제목 중복 체크용 인덱스)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.seen_titles (
  id BIGSERIAL PRIMARY KEY,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  normalized_title TEXT NOT NULL,
  article_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_type, normalized_title)
);

CREATE INDEX IF NOT EXISTS idx_seen_titles_room ON public.seen_titles(room_type);
CREATE INDEX IF NOT EXISTS idx_seen_titles_lookup ON public.seen_titles(room_type, normalized_title);

-- =====================================================
-- 6. bookmarks 테이블 (북마크/관심 매물)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id BIGSERIAL PRIMARY KEY,
  article_id BIGINT NOT NULL,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  bookmarked_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, room_type)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_room_type ON public.bookmarks(room_type);
CREATE INDEX IF NOT EXISTS idx_bookmarks_article_id ON public.bookmarks(article_id);

-- =====================================================
-- 7. crawl_metadata 테이블 (크롤링 메타데이터)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.crawl_metadata (
  id BIGSERIAL PRIMARY KEY,
  room_type TEXT NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  last_updated TIMESTAMPTZ NOT NULL,
  total_articles INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_type)
);

-- 초기 메타데이터 삽입
INSERT INTO public.crawl_metadata (room_type, last_updated, total_articles) VALUES
  ('oneroom', NOW(), 0),
  ('twothree', NOW(), 0),
  ('officetel', NOW(), 0)
ON CONFLICT (room_type) DO NOTHING;

-- =====================================================
-- RLS 정책 없음 (인증 없이 사용하는 앱)
-- 필요시 나중에 추가 가능
-- =====================================================

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_articles_updated_at ON public.articles;
CREATE TRIGGER update_articles_updated_at
    BEFORE UPDATE ON public.articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
