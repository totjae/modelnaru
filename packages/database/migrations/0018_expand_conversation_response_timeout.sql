ALTER TABLE conversations
    DROP CONSTRAINT conversations_response_timeout_seconds_check,
    ADD CONSTRAINT conversations_response_timeout_seconds_check
        CHECK (response_timeout_seconds BETWEEN 1 AND 1800);
