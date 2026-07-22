CREATE TABLE provider_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id varchar(64) NOT NULL,
    name varchar(100) NOT NULL,
    base_url text NOT NULL,
    credential_ciphertext bytea NOT NULL,
    credential_nonce bytea NOT NULL,
    credential_auth_tag bytea NOT NULL,
    credential_hint varchar(8),
    is_enabled boolean NOT NULL DEFAULT true,
    status varchar(16) NOT NULL DEFAULT 'ready',
    last_model_sync_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT provider_connections_template_id_check
        CHECK (template_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
    CONSTRAINT provider_connections_name_check
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    CONSTRAINT provider_connections_base_url_check
        CHECK (base_url LIKE 'https://%'),
    CONSTRAINT provider_connections_nonce_length_check
        CHECK (octet_length(credential_nonce) = 12),
    CONSTRAINT provider_connections_auth_tag_length_check
        CHECK (octet_length(credential_auth_tag) = 16),
    CONSTRAINT provider_connections_status_check
        CHECK (status IN ('ready', 'error'))
);

CREATE UNIQUE INDEX provider_connections_name_unique_idx
    ON provider_connections (lower(name));

CREATE INDEX provider_connections_template_idx
    ON provider_connections (template_id, created_at DESC);

CREATE TRIGGER provider_connections_set_updated_at
BEFORE UPDATE ON provider_connections
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE provider_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_connection_id uuid NOT NULL
        REFERENCES provider_connections(id) ON DELETE CASCADE,
    model_id varchar(255) NOT NULL,
    display_name varchar(255),
    context_window integer,
    max_output_tokens integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_enabled boolean NOT NULL DEFAULT false,
    is_available boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT provider_models_model_id_check
        CHECK (char_length(model_id) BETWEEN 1 AND 255),
    CONSTRAINT provider_models_context_window_check
        CHECK (context_window IS NULL OR context_window > 0),
    CONSTRAINT provider_models_max_output_tokens_check
        CHECK (max_output_tokens IS NULL OR max_output_tokens > 0),
    CONSTRAINT provider_models_connection_model_unique
        UNIQUE (provider_connection_id, model_id)
);

CREATE INDEX provider_models_connection_enabled_idx
    ON provider_models (provider_connection_id, is_enabled, model_id);

CREATE TRIGGER provider_models_set_updated_at
BEFORE UPDATE ON provider_models
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE user_model_permissions (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_model_id uuid NOT NULL
        REFERENCES provider_models(id) ON DELETE CASCADE,
    is_allowed boolean NOT NULL DEFAULT true,
    parameter_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider_model_id)
);

CREATE INDEX user_model_permissions_model_idx
    ON user_model_permissions (provider_model_id, user_id);

CREATE TRIGGER user_model_permissions_set_updated_at
BEFORE UPDATE ON user_model_permissions
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();
