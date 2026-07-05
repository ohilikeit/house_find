-- 004_rls_policies.sql
-- 이 앱은 인증(auth)이 없고 anon 키로 읽기/쓰기를 모두 수행한다.
-- Supabase 프로젝트 복구 시 RLS가 활성화되면서 정책이 없어 anon 접근이
-- 전면 차단되는 문제(에러 42501)를 해결한다.
-- RLS는 켜둔 채, anon/authenticated 역할에 전체 접근을 허용하는 정책을 추가한다.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'room_types', 'boards', 'articles',
    'seen_articles', 'seen_titles', 'bookmarks', 'crawl_metadata'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- RLS 활성 상태 보장
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- 재실행 가능하도록 기존 정책 제거 후 재생성
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'allow_all_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);',
      'allow_all_' || t, t
    );

    -- PostgREST 역할에 테이블 권한 보장
    EXECUTE format('GRANT ALL ON public.%I TO anon, authenticated;', t);
  END LOOP;
END $$;

-- 시퀀스 권한 (BIGSERIAL insert 시 필요)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
