-- Travel itinerary planner: supporting cache tables
-- Applies to: getouch.co database

-- Destination alias normalization (malaka → Melaka, Malaysia)
CREATE TABLE IF NOT EXISTS destination_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_name      VARCHAR(255) NOT NULL,
  canonical_name  VARCHAR(255) NOT NULL,
  city            VARCHAR(255) NOT NULL,
  country         VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS destination_aliases_input_idx
  ON destination_aliases (LOWER(input_name));

CREATE INDEX IF NOT EXISTS destination_aliases_canonical_idx
  ON destination_aliases (canonical_name);

-- POI alias normalization (A Famosa → A Famosa Fort, Melaka, Malaysia)
CREATE TABLE IF NOT EXISTS poi_aliases (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_canonical_name VARCHAR(255) NOT NULL,
  input_name                VARCHAR(255) NOT NULL,
  display_name              VARCHAR(255) NOT NULL,
  canonical_name            VARCHAR(500) NOT NULL,
  category                  VARCHAR(100),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS poi_aliases_dest_input_idx
  ON poi_aliases (destination_canonical_name, LOWER(input_name));

CREATE INDEX IF NOT EXISTS poi_aliases_dest_idx
  ON poi_aliases (destination_canonical_name);

-- POI image cache with confidence scoring
CREATE TABLE IF NOT EXISTS poi_image_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id            VARCHAR(500) NOT NULL,
  canonical_name    VARCHAR(500) NOT NULL,
  image_url         TEXT NOT NULL,
  source_page_url   TEXT,
  source_title      VARCHAR(500),
  provider          VARCHAR(255),
  confidence_score  REAL NOT NULL DEFAULT 0.0,
  validation_status VARCHAR(50) NOT NULL DEFAULT 'auto',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS poi_image_cache_poi_idx
  ON poi_image_cache (poi_id);

CREATE INDEX IF NOT EXISTS poi_image_cache_canonical_idx
  ON poi_image_cache (canonical_name);

CREATE INDEX IF NOT EXISTS poi_image_cache_score_idx
  ON poi_image_cache (confidence_score DESC);

-- Answer source cache (web search results per destination/trip)
CREATE TABLE IF NOT EXISTS answer_source_cache (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_canonical_name VARCHAR(255) NOT NULL,
  trip_days                 INTEGER NOT NULL,
  query_hash                VARCHAR(64) NOT NULL,
  source_id                 VARCHAR(50) NOT NULL,
  title                     VARCHAR(500) NOT NULL,
  url                       TEXT NOT NULL,
  domain                    VARCHAR(255) NOT NULL,
  snippet                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS answer_source_cache_hash_src_idx
  ON answer_source_cache (query_hash, source_id);

CREATE INDEX IF NOT EXISTS answer_source_cache_dest_idx
  ON answer_source_cache (destination_canonical_name, trip_days);

CREATE INDEX IF NOT EXISTS answer_source_cache_created_idx
  ON answer_source_cache (created_at DESC);
