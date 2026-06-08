-- Jotter Intelligence — Postgres + pgvector schema (the planned move off signals.jsonl).
-- Run against any Postgres 15+ with the pgvector extension (Supabase/Neon have it built in).
--   psql "$DATABASE_URL" -f web/db/schema.sql
--
-- NOTE: the embedding dimension below (1536) matches OpenAI text-embedding-3-small.
-- If we pick a different embeddings model, change vector(1536) to its dimension and
-- recreate the index. Until embeddings are loaded, everything except semantic search works.

create extension if not exists vector;

create table if not exists signals (
  id          text primary key,           -- e.g. "naughton-1234-2"
  post_id     text not null,              -- groups sections of one source post
  source_id   text not null,              -- expert/publication id (FK-ish to experts.id)
  source      text not null,              -- display name at ingest time
  category    text not null default 'author',  -- 'author' | 'publication'
  date        date not null,
  year        int  not null,
  type        text not null,              -- source-specific (note/article/quote/…)
  kind        text not null,              -- universal (longread/article/quote/links/data)
  heading     text not null,
  body        text not null default '',   -- "text" is reserved-ish; store as body
  themes      text[]  not null default '{}',
  links       jsonb   not null default '[]',
  images      text[]  not null default '{}',
  post_url    text not null default '',
  upload_id   text,                       -- set for in-app PDF/RSS uploads
  upload_name text,
  -- full-text search vector (weighted: heading > body), maintained by the trigger below
  fts         tsvector,
  -- semantic search vector; null until the embedder backfills it
  embedding   vector(1536)
);

-- structured filters used by the dashboard
create index if not exists signals_date_idx      on signals (date desc);
create index if not exists signals_source_idx     on signals (source_id);
create index if not exists signals_year_idx       on signals (year);
create index if not exists signals_kind_idx       on signals (kind);
create index if not exists signals_themes_gin     on signals using gin (themes);

-- keyword search (mirrors lib/data searchSignals' whole-word intent, but in Postgres)
create index if not exists signals_fts_gin        on signals using gin (fts);

-- semantic search (HNSW = fast approximate cosine NN; build after embeddings are loaded)
create index if not exists signals_embedding_hnsw on signals using hnsw (embedding vector_cosine_ops);

-- keep the fts column in sync (heading weighted A, body weighted B)
create or replace function signals_fts_update() returns trigger as $$
begin
  new.fts :=
    setweight(to_tsvector('english', coalesce(new.heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.body, '')), 'B');
  return new;
end;
$$ language plpgsql;

drop trigger if exists signals_fts_trg on signals;
create trigger signals_fts_trg before insert or update of heading, body
  on signals for each row execute function signals_fts_update();

-- lightweight expert/source table (mirrors web/data/experts.json aggregates we still
-- compute in the engine; kept here so joins/labels don't depend on a JSON read).
create table if not exists experts (
  id        text primary key,
  name      text not null,
  blurb     text default '',
  url       text default '',
  category  text not null default 'author',
  signals   int  default 0,
  date_min  date,
  date_max  date,
  uploaded  boolean default false
);
