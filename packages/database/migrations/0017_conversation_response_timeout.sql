ALTER TABLE conversations
    ADD COLUMN response_timeout_seconds integer NOT NULL DEFAULT 120,
    ADD CONSTRAINT conversations_response_timeout_seconds_check
        CHECK (response_timeout_seconds BETWEEN 30 AND 1800);
