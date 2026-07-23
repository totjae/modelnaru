ALTER TABLE conversations
    ADD COLUMN request_trace_limit smallint NOT NULL DEFAULT 3,
    ADD CONSTRAINT conversations_request_trace_limit_check
        CHECK (request_trace_limit BETWEEN 0 AND 3);

ALTER TABLE guest_settings
    ADD COLUMN request_trace_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE operational_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category varchar(16) NOT NULL,
    level varchar(16) NOT NULL DEFAULT 'info',
    action varchar(64) NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'success',
    actor_type varchar(16),
    actor_id varchar(128),
    actor_label varchar(100),
    target_type varchar(64),
    target_id uuid,
    provider_template_id_snapshot varchar(64),
    model_id_snapshot varchar(255),
    error_code varchar(64),
    duration_ms integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT operational_logs_category_check
        CHECK (category IN ('security', 'file', 'system')),
    CONSTRAINT operational_logs_level_check
        CHECK (level IN ('debug', 'info', 'warn', 'error')),
    CONSTRAINT operational_logs_action_check
        CHECK (action ~ '^[a-z][a-z0-9_.-]{2,63}$'),
    CONSTRAINT operational_logs_status_check
        CHECK (status IN ('success', 'failed', 'denied', 'cancelled')),
    CONSTRAINT operational_logs_actor_type_check
        CHECK (
            actor_type IS NULL
            OR actor_type IN ('admin', 'user', 'guest', 'system')
        ),
    CONSTRAINT operational_logs_target_type_check
        CHECK (
            target_type IS NULL
            OR target_type ~ '^[a-z][a-z0-9_.-]{1,63}$'
        ),
    CONSTRAINT operational_logs_duration_check
        CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT operational_logs_metadata_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX operational_logs_occurred_idx
    ON operational_logs (occurred_at DESC, id DESC);

CREATE INDEX operational_logs_category_occurred_idx
    ON operational_logs (category, occurred_at DESC, id DESC);

CREATE INDEX operational_logs_action_occurred_idx
    ON operational_logs (action, occurred_at DESC);

CREATE TABLE log_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    ai_retention_days integer NOT NULL DEFAULT 90,
    security_retention_days integer NOT NULL DEFAULT 180,
    audit_retention_days integer NOT NULL DEFAULT 365,
    file_retention_days integer NOT NULL DEFAULT 90,
    system_retention_days integer NOT NULL DEFAULT 30,
    last_cleanup_at timestamptz,
    last_cleanup_deleted_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT log_settings_retention_check
        CHECK (
            ai_retention_days BETWEEN 7 AND 365
            AND security_retention_days BETWEEN 30 AND 730
            AND audit_retention_days BETWEEN 90 AND 1825
            AND file_retention_days BETWEEN 7 AND 365
            AND system_retention_days BETWEEN 7 AND 180
        ),
    CONSTRAINT log_settings_cleanup_count_check
        CHECK (last_cleanup_deleted_count >= 0)
);

INSERT INTO log_settings (singleton) VALUES (true);

CREATE TRIGGER log_settings_set_updated_at
BEFORE UPDATE ON log_settings
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();
