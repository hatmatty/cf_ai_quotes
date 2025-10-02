-- Migration number: 0001 	 2024-10-23T17:38:19.094Z
CREATE TABLE quotes (
    id TEXT PRIMARY KEY,
    quote TEXT NOT NULL,
    author TEXT,
    tags TEXT,
    creator UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK (status IN ('published', 'draft', 'flagged')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY,            
    username TEXT NOT NULL,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP

);

CREATE TABLE anonymous_sessions (
    session_id UUID PRIMARY KEY,         
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_interactions (
    interaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id UUID,                            -- UUID of the registered user, nullable for anonymous interactions
    session_id UUID,                         -- UUID of the anonymous session, nullable for registered users
    quote_id UUID NOT NULL,
    interaction_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (session_id) REFERENCES anonymous_sessions(session_id),
    FOREIGN KEY (quote_id) REFERENCES quotes(id)
);
-- Ensure one like per user/session per quote
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_like
ON quote_interactions (quote_id, user_id, session_id, interaction_type);

