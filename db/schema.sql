-- VoteVista database schema (Postgres + PostGIS).
-- Mirrors the JSON files in data/ and sources/ so the app's data shapes
-- are unchanged. Apply with: psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists postgis;

create table if not exists constituency (
  ac_no             int primary key,
  ac_name           text not null,
  pc_name           text,
  district          text,
  state             text,
  election          text,
  poll_date         date,
  result_date       date,
  total_electors    int,
  total_valid_votes int,
  turnout_pct       numeric,
  reservation       text,
  boundary          geometry(Polygon, 4326)
);
create index if not exists constituency_boundary_gix on constituency using gist (boundary);

create table if not exists candidate (
  id                   bigserial primary key,
  ac_no                int references constituency(ac_no),
  name                 text not null,
  party                text,
  party_short          text,
  is_seat_winner       boolean default false,
  is_incumbent         boolean default false,
  result               text,
  votes                int,
  vote_share_pct       numeric,
  age                  int,
  education            text,
  profession           text,
  assets_total_inr     bigint,
  liabilities_inr      bigint,
  criminal_cases_count int default 0,
  criminal_cases_note  text,
  affidavit_url        text,
  manifesto_url        text,
  prs_url              text,
  photo_url            text,
  ai_summary           text,
  unique (ac_no, name)
);

create table if not exists winning_party (
  ac_no                  int primary key references constituency(ac_no),
  party                  text,
  party_short            text,
  winning_candidate      text,
  term                   text,
  tenure_note            text,
  state_government_party text,
  manifesto_2023_url     text,
  manifesto_2023_title   text
);

-- Source text/links that feed the AI features (affidavit, news, manifesto).
create table if not exists source_doc (
  id           bigserial primary key,
  ac_no        int references constituency(ac_no),
  kind         text not null,            -- 'affidavit' | 'news' | 'manifesto'
  title        text,
  publisher    text,
  doc_date     text,
  url          text,
  category     text,
  verification text,
  body         text
);
create index if not exists source_doc_ac_kind_idx on source_doc (ac_no, kind);
