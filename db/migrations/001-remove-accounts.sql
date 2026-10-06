-- Apply once when upgrading an existing installation to the public explorer.
-- The application no longer stores or uses account data.
USE election_db;
DROP TABLE IF EXISTS users;
