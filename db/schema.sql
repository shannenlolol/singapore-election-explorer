-- =========================================
-- SG Election App – Schema (MySQL 8+)
-- =========================================
USE election_db;
SET NAMES utf8mb4;
-- -----------------------------------------
-- 1) political_parties
-- API: abbreviation, political_party
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS political_parties (
  abbreviation VARCHAR(32) NOT NULL,
  political_party VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (abbreviation),
  KEY idx_party_name (political_party)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------
-- 2) ge_dates
-- API: year, nomination_day, polling_day
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_dates (
  year INT NOT NULL,
  nomination_day DATE NULL,
  polling_day DATE NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------
-- 3) ge_elector_stats
-- API: year, constituency, no_of_registered_electors, no_of_rejected_votes, no_of_spoilt_ballot_papers
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_elector_stats (
  year INT NOT NULL,
  constituency VARCHAR(255) NOT NULL,

  no_of_registered_electors INT NULL,
  no_of_rejected_votes INT NULL,
  no_of_spoilt_ballot_papers INT NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (year, constituency),
  KEY idx_elector_year (year),
  KEY idx_elector_constituency (constituency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------
-- 4) ge_candidate_results
-- API: year, constituency, constituency_type, candidates, party, vote_count, vote_percentage
-- Notes:
-- - vote_percentage in dataset is typically a fraction (0..1).
-- - UNIQUE includes candidates to avoid collisions for GRC where same party has multiple candidates.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_candidate_results (
  id BIGINT NOT NULL AUTO_INCREMENT,

  year INT NOT NULL,
  constituency VARCHAR(255) NOT NULL,
  constituency_type VARCHAR(8) NULL,  -- 'GRC' or 'SMC'
  candidates VARCHAR(255) NULL,

  party VARCHAR(32) NOT NULL,         -- party abbreviation (e.g., PAP, WP)
  vote_count INT NULL,
  vote_percentage DECIMAL(10, 6) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_candidate_row (year, constituency, party, candidates),

  KEY idx_results_year (year),
  KEY idx_results_constituency (constituency),
  KEY idx_results_type (constituency_type),
  KEY idx_results_party (party)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------
-- 5) ge_summary (derived)
-- Used by dashboard table: year, constituency, type, winner, margin, turnout
-- margin_pct is stored as percentage points (e.g., 12.34)
-- turnout_pct is stored as percentage (e.g., 93.21)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_summary (
  year INT NOT NULL,
  constituency VARCHAR(255) NOT NULL,
  constituency_type VARCHAR(8) NULL,

  winner_party VARCHAR(32) NULL,
  margin_pct DECIMAL(10, 4) NULL,
  turnout_pct DECIMAL(10, 4) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (year, constituency),

  KEY idx_summary_year (year),
  KEY idx_summary_constituency (constituency),
  KEY idx_summary_type (constituency_type),
  KEY idx_summary_winner (winner_party)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------
-- 6) ge_top_parties (derived)
-- Top 3 parties per (year, constituency)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_top_parties (
  year INT NOT NULL,
  constituency VARCHAR(255) NOT NULL,
  party VARCHAR(32) NOT NULL,
  rank_no INT NOT NULL, -- 1..3

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (year, constituency, party),

  KEY idx_top_rank (year, constituency, rank_no),
  KEY idx_top_party (party)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;





USE election_db;
SET NAMES utf8mb4;

-- -----------------------------------------
-- Store GeoJSON boundaries by year
-- This table is populated ONLY by sync script.
-- Runtime reads from this table only.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_boundaries (
  year INT NOT NULL,
  source_dataset_id VARCHAR(64) NULL,

  -- full GeoJSON FeatureCollection for that year
  geojson JSON NOT NULL,

  -- optional: when it was last synced
  last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (year),
  KEY idx_boundaries_dataset (source_dataset_id),
  KEY idx_boundaries_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- -----------------------------------------
-- Optional: pre-extracted features for fast lookups
-- (useful if your FeatureCollection is huge)
-- Populate in sync script too.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS ge_boundary_features (
  year INT NOT NULL,
  constituency VARCHAR(255) NOT NULL,
  constituency_type VARCHAR(8) NULL,  -- 'GRC' / 'SMC' if you can infer
  properties JSON NULL,
  geometry JSON NOT NULL,

  -- optional: small bbox for quick map fits
  min_lng DOUBLE NULL,
  min_lat DOUBLE NULL,
  max_lng DOUBLE NULL,
  max_lat DOUBLE NULL,

  last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (year, constituency),
  KEY idx_bf_year (year),
  KEY idx_bf_const (constituency),
  KEY idx_bf_type (constituency_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Import timestamps refer to successful local imports, not upstream publication dates.
CREATE TABLE IF NOT EXISTS data_sync_status (
  id TINYINT NOT NULL PRIMARY KEY,
  status ENUM('running', 'succeeded', 'failed') NOT NULL,
  last_started_at DATETIME NULL,
  last_successful_at DATETIME NULL,
  last_finished_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
