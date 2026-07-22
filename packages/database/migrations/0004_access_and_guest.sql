ALTER TABLE users
ADD COLUMN daily_request_limit integer;

ALTER TABLE users
ADD CONSTRAINT users_daily_request_limit_check
CHECK (daily_request_limit IS NULL OR daily_request_limit BETWEEN 1 AND 100000);

ALTER TABLE user_model_permissions
ADD COLUMN daily_request_limit integer;

ALTER TABLE user_model_permissions
ADD CONSTRAINT user_model_permissions_daily_limit_check
CHECK (daily_request_limit IS NULL OR daily_request_limit BETWEEN 1 AND 100000);

CREATE TABLE guest_settings (
    singleton boolean PRIMARY KEY DEFAULT true,
    is_enabled boolean NOT NULL DEFAULT false,
    access_code_hash text,
    maximum_active_sessions integer NOT NULL DEFAULT 10,
    session_daily_request_limit integer NOT NULL DEFAULT 20,
    global_daily_request_limit integer NOT NULL DEFAULT 100,
    idle_timeout_minutes integer NOT NULL DEFAULT 60,
    absolute_timeout_hours integer NOT NULL DEFAULT 24,
    reset_timezone varchar(64) NOT NULL DEFAULT 'Asia/Seoul',
    file_upload_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT guest_settings_singleton_check CHECK (singleton = true),
    CONSTRAINT guest_settings_access_code_hash_check
        CHECK (access_code_hash IS NULL OR access_code_hash LIKE '$argon2id$%'),
    CONSTRAINT guest_settings_enabled_code_check
        CHECK (is_enabled = false OR access_code_hash IS NOT NULL),
    CONSTRAINT guest_settings_maximum_sessions_check
        CHECK (maximum_active_sessions BETWEEN 1 AND 100),
    CONSTRAINT guest_settings_session_daily_limit_check
        CHECK (session_daily_request_limit BETWEEN 1 AND 1000),
    CONSTRAINT guest_settings_global_daily_limit_check
        CHECK (global_daily_request_limit BETWEEN 1 AND 100000),
    CONSTRAINT guest_settings_idle_timeout_check
        CHECK (idle_timeout_minutes BETWEEN 15 AND 360),
    CONSTRAINT guest_settings_absolute_timeout_check
        CHECK (absolute_timeout_hours BETWEEN 1 AND 72),
    CONSTRAINT guest_settings_timezone_check
        CHECK (char_length(btrim(reset_timezone)) BETWEEN 1 AND 64)
);

INSERT INTO guest_settings (singleton) VALUES (true);

CREATE TRIGGER guest_settings_set_updated_at
BEFORE UPDATE ON guest_settings
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE guest_principals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_fingerprint bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    idle_expires_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    deleted_at timestamptz,

    CONSTRAINT guest_principals_time_order_check
        CHECK (
            last_seen_at >= created_at
            AND idle_expires_at > last_seen_at
            AND absolute_expires_at > created_at
        ),
    CONSTRAINT guest_principals_credential_fingerprint_check
        CHECK (octet_length(credential_fingerprint) = 32)
);

CREATE INDEX guest_principals_active_expiry_idx
    ON guest_principals (idle_expires_at, absolute_expires_at)
    WHERE deleted_at IS NULL;

ALTER TABLE sessions
DROP CONSTRAINT sessions_principal_user_check;

ALTER TABLE sessions
DROP CONSTRAINT sessions_principal_type_check;

ALTER TABLE sessions
ADD COLUMN guest_id uuid REFERENCES guest_principals(id) ON DELETE CASCADE;

ALTER TABLE sessions
ADD CONSTRAINT sessions_principal_type_check
CHECK (principal_type IN ('admin', 'user', 'guest'));

ALTER TABLE sessions
ADD CONSTRAINT sessions_principal_owner_check
CHECK (
    (principal_type = 'admin' AND user_id IS NULL AND guest_id IS NULL)
    OR (principal_type = 'user' AND user_id IS NOT NULL AND guest_id IS NULL)
    OR (principal_type = 'guest' AND user_id IS NULL AND guest_id IS NOT NULL)
);

CREATE UNIQUE INDEX sessions_active_guest_idx
    ON sessions (guest_id)
    WHERE guest_id IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE guest_model_permissions (
    provider_model_id uuid PRIMARY KEY
        REFERENCES provider_models(id) ON DELETE CASCADE,
    is_allowed boolean NOT NULL DEFAULT true,
    daily_request_limit integer,
    parameter_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT guest_model_permissions_daily_limit_check
        CHECK (daily_request_limit IS NULL OR daily_request_limit BETWEEN 1 AND 100000)
);

CREATE TRIGGER guest_model_permissions_set_updated_at
BEFORE UPDATE ON guest_model_permissions
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE daily_usage_counters (
    usage_date date NOT NULL,
    counter_key varchar(255) NOT NULL,
    scope varchar(32) NOT NULL,
    subject_id uuid,
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE CASCADE,
    request_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usage_date, counter_key),

    CONSTRAINT daily_usage_counters_scope_check
        CHECK (scope IN ('user', 'user_model', 'guest_session', 'guest_model', 'guest_global')),
    CONSTRAINT daily_usage_counters_key_check
        CHECK (char_length(counter_key) BETWEEN 1 AND 255),
    CONSTRAINT daily_usage_counters_count_check
        CHECK (request_count >= 0)
);

CREATE INDEX daily_usage_counters_subject_idx
    ON daily_usage_counters (subject_id, usage_date DESC)
    WHERE subject_id IS NOT NULL;

CREATE INDEX daily_usage_counters_model_idx
    ON daily_usage_counters (provider_model_id, usage_date DESC)
    WHERE provider_model_id IS NOT NULL;

CREATE TRIGGER daily_usage_counters_set_updated_at
BEFORE UPDATE ON daily_usage_counters
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();
