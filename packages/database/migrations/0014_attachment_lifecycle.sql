ALTER TABLE attachments
    DROP CONSTRAINT attachments_status_check;

ALTER TABLE attachments
    ADD CONSTRAINT attachments_status_check
        CHECK (status IN ('processing', 'ready', 'failed', 'expired'));

CREATE TABLE attachment_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    retention_days integer NOT NULL DEFAULT 30,
    is_configured boolean NOT NULL DEFAULT false,
    last_cleanup_at timestamptz,
    last_cleanup_expired_count integer NOT NULL DEFAULT 0,
    last_cleanup_deleted_count integer NOT NULL DEFAULT 0,
    last_cleanup_failed_count integer NOT NULL DEFAULT 0,
    last_cleanup_guest_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT attachment_settings_retention_check
        CHECK (retention_days BETWEEN 1 AND 3650),
    CONSTRAINT attachment_settings_cleanup_counts_check
        CHECK (
            last_cleanup_expired_count >= 0
            AND last_cleanup_deleted_count >= 0
            AND last_cleanup_failed_count >= 0
            AND last_cleanup_guest_count >= 0
        )
);

INSERT INTO attachment_settings (singleton, retention_days)
VALUES (true, 30);

CREATE TRIGGER attachment_settings_set_updated_at
BEFORE UPDATE ON attachment_settings
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE attachment_cleanup_queue (
    storage_key varchar(128) PRIMARY KEY,
    attachment_id uuid,
    reason varchar(32) NOT NULL,
    queued_at timestamptz NOT NULL DEFAULT now(),
    attempt_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    last_error varchar(255),

    CONSTRAINT attachment_cleanup_queue_key_check
        CHECK (storage_key ~ '^[0-9a-f]{2}/[0-9a-f-]{36}$'),
    CONSTRAINT attachment_cleanup_queue_reason_check
        CHECK (reason IN ('cascade_delete', 'expired')),
    CONSTRAINT attachment_cleanup_queue_attempt_check
        CHECK (attempt_count >= 0)
);

CREATE INDEX attachment_cleanup_queue_queued_idx
    ON attachment_cleanup_queue (queued_at, storage_key);

CREATE FUNCTION modelnaru_queue_attachment_file_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO attachment_cleanup_queue (
        storage_key,
        attachment_id,
        reason
    ) VALUES (
        OLD.storage_key,
        OLD.id,
        'cascade_delete'
    )
    ON CONFLICT (storage_key) DO UPDATE
    SET reason = EXCLUDED.reason,
        queued_at = LEAST(
            attachment_cleanup_queue.queued_at,
            EXCLUDED.queued_at
        );
    RETURN OLD;
END;
$$;

CREATE TRIGGER attachments_queue_file_delete
BEFORE DELETE ON attachments
FOR EACH ROW
EXECUTE FUNCTION modelnaru_queue_attachment_file_delete();
