CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(64) NOT NULL,
    username_normalized varchar(64) NOT NULL,
    password_hash text NOT NULL,
    display_name varchar(100),
    is_enabled boolean NOT NULL DEFAULT true,
    credential_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_username_format_check
        CHECK (username ~ '^[A-Za-z0-9_.-]{3,64}$'),
    CONSTRAINT users_username_normalized_check
        CHECK (username_normalized = lower(username)),
    CONSTRAINT users_password_hash_check
        CHECK (password_hash LIKE '$argon2id$%'),
    CONSTRAINT users_credential_version_check
        CHECK (credential_version >= 1),
    CONSTRAINT users_username_normalized_unique
        UNIQUE (username_normalized)
);

CREATE FUNCTION modelnaru_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_type varchar(16) NOT NULL,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    account_key varchar(128) NOT NULL,
    token_hash bytea NOT NULL,
    csrf_token_hash bytea NOT NULL,
    credential_fingerprint bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    idle_expires_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_reason varchar(64),
    ip_hash bytea,
    user_agent_hash bytea,

    CONSTRAINT sessions_principal_type_check
        CHECK (principal_type IN ('admin', 'user')),
    CONSTRAINT sessions_principal_user_check
        CHECK (
            (principal_type = 'admin' AND user_id IS NULL)
            OR (principal_type = 'user' AND user_id IS NOT NULL)
        ),
    CONSTRAINT sessions_token_hash_length_check
        CHECK (octet_length(token_hash) = 32),
    CONSTRAINT sessions_csrf_token_hash_length_check
        CHECK (octet_length(csrf_token_hash) = 32),
    CONSTRAINT sessions_credential_fingerprint_length_check
        CHECK (octet_length(credential_fingerprint) = 32),
    CONSTRAINT sessions_ip_hash_length_check
        CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
    CONSTRAINT sessions_user_agent_hash_length_check
        CHECK (user_agent_hash IS NULL OR octet_length(user_agent_hash) = 32),
    CONSTRAINT sessions_time_order_check
        CHECK (
            last_seen_at >= created_at
            AND idle_expires_at > last_seen_at
            AND absolute_expires_at > created_at
        ),
    CONSTRAINT sessions_revocation_check
        CHECK (
            (revoked_at IS NULL AND revoked_reason IS NULL)
            OR revoked_at IS NOT NULL
        ),
    CONSTRAINT sessions_token_hash_unique
        UNIQUE (token_hash)
);

CREATE INDEX sessions_active_account_created_idx
    ON sessions (account_key, created_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX sessions_active_idle_expiry_idx
    ON sessions (idle_expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX sessions_active_absolute_expiry_idx
    ON sessions (absolute_expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX sessions_user_id_idx
    ON sessions (user_id)
    WHERE user_id IS NOT NULL;
