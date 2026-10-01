-- New release foundation. Keep 0001-0019 intact for checksum-compatible installs.

ALTER TABLE provider_connections
    ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'builtin',
    ADD COLUMN protocol varchar(64),
    ADD COLUMN auth_mode varchar(16) NOT NULL DEFAULT 'bearer',
    ADD COLUMN destination_kind varchar(16) NOT NULL DEFAULT 'public',
    ADD COLUMN approved_local_ip inet,
    ADD COLUMN approved_local_port integer,
    ADD COLUMN diagnostic_network_status varchar(16),
    ADD COLUMN diagnostic_network_checked_at timestamptz,
    ADD COLUMN diagnostic_network_error_code varchar(64),
    ADD COLUMN diagnostic_models_status varchar(16),
    ADD COLUMN diagnostic_models_checked_at timestamptz,
    ADD COLUMN diagnostic_models_error_code varchar(64),
    ADD COLUMN diagnostic_chat_status varchar(16),
    ADD COLUMN diagnostic_chat_checked_at timestamptz,
    ADD COLUMN diagnostic_chat_error_code varchar(64);

ALTER TABLE provider_connections
    ALTER COLUMN credential_ciphertext DROP NOT NULL,
    ALTER COLUMN credential_nonce DROP NOT NULL,
    ALTER COLUMN credential_auth_tag DROP NOT NULL,
    DROP CONSTRAINT provider_connections_base_url_check,
    ADD CONSTRAINT provider_connections_kind_protocol_check CHECK (
        (kind = 'builtin' AND protocol IS NULL AND template_id <> 'custom-openai'
            AND auth_mode = 'bearer' AND destination_kind = 'public')
        OR (kind = 'custom' AND template_id = 'custom-openai'
            AND protocol = 'openai-chat-completions')
    ),
    ADD CONSTRAINT provider_connections_auth_check CHECK (
        (auth_mode = 'none' AND credential_ciphertext IS NULL
            AND credential_nonce IS NULL AND credential_auth_tag IS NULL
            AND credential_hint IS NULL)
        OR (auth_mode = 'bearer' AND credential_ciphertext IS NOT NULL
            AND credential_nonce IS NOT NULL AND credential_auth_tag IS NOT NULL
            AND octet_length(credential_nonce) = 12
            AND octet_length(credential_auth_tag) = 16)
    ),
    ADD CONSTRAINT provider_connections_destination_check CHECK (
        (destination_kind = 'public' AND approved_local_ip IS NULL
            AND approved_local_port IS NULL AND base_url LIKE 'https://%')
        OR (destination_kind = 'local' AND approved_local_ip IS NOT NULL
            AND approved_local_port BETWEEN 1 AND 65535
            AND base_url LIKE 'http://%'
            AND (
                base_url = 'http://' || CASE WHEN family(approved_local_ip) = 6
                    THEN '[' || host(approved_local_ip) || ']'
                    ELSE host(approved_local_ip) END || ':' || approved_local_port::text
                OR base_url LIKE 'http://' || CASE WHEN family(approved_local_ip) = 6
                    THEN '[' || host(approved_local_ip) || ']'
                    ELSE host(approved_local_ip) END || ':' || approved_local_port::text || '/%'
            ))
    );

ALTER TABLE provider_models
    ADD COLUMN source varchar(16) NOT NULL DEFAULT 'discovered'
        CHECK (source IN ('discovered', 'manual')),
    ADD COLUMN image_token_estimate integer
        CHECK (image_token_estimate IS NULL OR image_token_estimate >= 1024);

ALTER TABLE messages DROP CONSTRAINT messages_content_check;
ALTER TABLE messages ADD CONSTRAINT messages_content_check CHECK (
    CASE WHEN role = 'assistant' THEN octet_length(content) <= 8388608
    ELSE char_length(content) <= 2000000 END
);

ALTER TABLE conversations
    ADD COLUMN settings_revision bigint NOT NULL DEFAULT 1 CHECK (settings_revision >= 1),
    ADD COLUMN is_pinned boolean NOT NULL DEFAULT false,
    ADD COLUMN title_source varchar(16) NOT NULL DEFAULT 'default'
        CHECK (title_source IN ('default', 'auto', 'manual')),
    ADD COLUMN title_status varchar(16) NOT NULL DEFAULT 'none'
        CHECK (title_status IN ('none', 'pending', 'completed', 'failed'));

CREATE INDEX conversations_user_pinned_updated_idx
    ON conversations (user_id, is_pinned DESC, updated_at DESC, id DESC)
    WHERE user_id IS NOT NULL;
CREATE INDEX conversations_guest_pinned_updated_idx
    ON conversations (guest_id, is_pinned DESC, updated_at DESC, id DESC)
    WHERE guest_id IS NOT NULL;

CREATE TABLE chat_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    guest_id uuid REFERENCES guest_principals(id) ON DELETE CASCADE,
    started_session_id uuid NOT NULL,
    kind varchar(16) NOT NULL CHECK (kind IN ('turn', 'regenerate')),
    idempotency_key uuid NOT NULL,
    request_fingerprint bytea NOT NULL CHECK (octet_length(request_fingerprint) = 32),
    settings_revision bigint NOT NULL CHECK (settings_revision >= 1),
    maximum_generated_text_bytes integer NOT NULL
        CHECK (maximum_generated_text_bytes BETWEEN 65536 AND 8388608),
    branch_id uuid NOT NULL,
    user_message_id uuid,
    assistant_message_id uuid NOT NULL UNIQUE,
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision >= 1),
    checkpoint_content text NOT NULL DEFAULT ''
        CHECK (octet_length(checkpoint_content) <= 8388608),
    quota_state varchar(16) NOT NULL DEFAULT 'reserved'
        CHECK (quota_state IN ('reserved', 'charged', 'released')),
    error_code varchar(64),
    input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT chat_jobs_owner_check CHECK (
        (user_id IS NOT NULL)::integer + (guest_id IS NOT NULL)::integer = 1),
    CONSTRAINT chat_jobs_kind_message_check CHECK (
        (kind = 'turn' AND user_message_id IS NOT NULL)
        OR (kind = 'regenerate' AND user_message_id IS NULL)),
    CONSTRAINT chat_jobs_terminal_check CHECK (
        (status IN ('pending', 'streaming') AND finished_at IS NULL)
        OR (status IN ('completed', 'failed', 'cancelled') AND finished_at IS NOT NULL)),
    CONSTRAINT chat_jobs_branch_fk FOREIGN KEY (branch_id, conversation_id)
        REFERENCES conversation_branches(id, conversation_id) ON DELETE CASCADE,
    CONSTRAINT chat_jobs_user_message_fk FOREIGN KEY (user_message_id, conversation_id)
        REFERENCES messages(id, conversation_id) ON DELETE CASCADE,
    CONSTRAINT chat_jobs_assistant_message_fk FOREIGN KEY (assistant_message_id, conversation_id)
        REFERENCES messages(id, conversation_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX chat_jobs_user_key_idx ON chat_jobs (user_id, idempotency_key)
    WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX chat_jobs_guest_key_idx ON chat_jobs (guest_id, idempotency_key)
    WHERE guest_id IS NOT NULL;
CREATE UNIQUE INDEX chat_jobs_active_conversation_idx ON chat_jobs (conversation_id)
    WHERE status IN ('pending', 'streaming');
CREATE UNIQUE INDEX chat_jobs_active_user_idx ON chat_jobs (user_id)
    WHERE user_id IS NOT NULL AND status IN ('pending', 'streaming');
CREATE UNIQUE INDEX chat_jobs_active_guest_idx ON chat_jobs (guest_id)
    WHERE guest_id IS NOT NULL AND status IN ('pending', 'streaming');
CREATE INDEX chat_jobs_startup_idx ON chat_jobs (status, created_at)
    WHERE status IN ('pending', 'streaming');
CREATE INDEX chat_jobs_terminal_cleanup_idx ON chat_jobs (finished_at)
    WHERE status NOT IN ('pending', 'streaming');
CREATE INDEX chat_jobs_conversation_created_idx ON chat_jobs (conversation_id, created_at DESC);
CREATE TRIGGER chat_jobs_set_updated_at BEFORE UPDATE ON chat_jobs
    FOR EACH ROW EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE chat_quota_reservations (
    job_id uuid PRIMARY KEY REFERENCES chat_jobs(id) ON DELETE CASCADE,
    usage_date date NOT NULL,
    counter_keys text[] NOT NULL,
    state varchar(16) NOT NULL DEFAULT 'reserved'
        CHECK (state IN ('reserved', 'charged', 'released')),
    reserved_at timestamptz NOT NULL DEFAULT now(),
    first_sent_at timestamptz,
    released_at timestamptz,
    CONSTRAINT chat_quota_keys_check CHECK (
        cardinality(counter_keys) BETWEEN 1 AND 3
        AND array_position(counter_keys, NULL) IS NULL
        AND (cardinality(counter_keys) = 1
            OR (counter_keys[1] <> counter_keys[2]
                AND (cardinality(counter_keys) = 2
                    OR (counter_keys[1] <> counter_keys[3]
                        AND counter_keys[2] <> counter_keys[3]))))
    ),
    CONSTRAINT chat_quota_state_time_check CHECK (
        (state = 'reserved' AND first_sent_at IS NULL AND released_at IS NULL)
        OR (state = 'charged' AND first_sent_at IS NOT NULL AND released_at IS NULL)
        OR (state = 'released' AND first_sent_at IS NULL AND released_at IS NOT NULL)
    )
);

CREATE TABLE title_generation_settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO title_generation_settings (id) VALUES (1);
CREATE TRIGGER title_generation_settings_set_updated_at
    BEFORE UPDATE ON title_generation_settings
    FOR EACH ROW EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE conversation_title_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    started_session_id uuid NOT NULL,
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    settings_version bigint NOT NULL CHECK (settings_version >= 1),
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT conversation_title_tasks_terminal_check CHECK (
        (status = 'pending' AND finished_at IS NULL)
        OR (status <> 'pending' AND finished_at IS NOT NULL))
);

CREATE TABLE principal_last_models (
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    guest_id uuid REFERENCES guest_principals(id) ON DELETE CASCADE,
    provider_model_id uuid NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT principal_last_models_owner_check CHECK (
        (user_id IS NOT NULL)::integer + (guest_id IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX principal_last_models_user_idx ON principal_last_models (user_id)
    WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX principal_last_models_guest_idx ON principal_last_models (guest_id)
    WHERE guest_id IS NOT NULL;

CREATE TABLE model_favorites (
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    guest_id uuid REFERENCES guest_principals(id) ON DELETE CASCADE,
    provider_model_id uuid NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT model_favorites_owner_check CHECK (
        (user_id IS NOT NULL)::integer + (guest_id IS NOT NULL)::integer = 1)
);
CREATE UNIQUE INDEX model_favorites_user_model_idx
    ON model_favorites (user_id, provider_model_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX model_favorites_guest_model_idx
    ON model_favorites (guest_id, provider_model_id) WHERE guest_id IS NOT NULL;

ALTER TABLE usage_events
    DROP CONSTRAINT usage_events_operation_type_check,
    ADD CONSTRAINT usage_events_operation_type_check
        CHECK (operation_type IN ('chat', 'summary', 'title')),
    ADD COLUMN job_id uuid REFERENCES chat_jobs(id) ON DELETE SET NULL,
    ADD COLUMN conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
    ADD COLUMN title_task_id uuid REFERENCES conversation_title_tasks(id) ON DELETE SET NULL,
    ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
    ADD COLUMN sent_at timestamptz,
    ADD COLUMN usage_known boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX usage_events_job_attempt_idx
    ON usage_events (job_id, operation_type, attempt_number) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX usage_events_title_task_idx
    ON usage_events (title_task_id) WHERE title_task_id IS NOT NULL;
UPDATE usage_events SET usage_known = true
    WHERE input_tokens IS NOT NULL OR output_tokens IS NOT NULL;

ALTER TABLE attachments
    ADD COLUMN in_use_job_id uuid REFERENCES chat_jobs(id) ON DELETE SET NULL;
CREATE INDEX attachments_in_use_job_idx ON attachments (in_use_job_id)
    WHERE in_use_job_id IS NOT NULL;
