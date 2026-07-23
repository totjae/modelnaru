CREATE TABLE usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assistant_message_id uuid UNIQUE
        REFERENCES messages(id) ON DELETE SET NULL,
    principal_type varchar(16) NOT NULL,
    principal_id uuid NOT NULL,
    principal_label varchar(100) NOT NULL,
    provider_model_id uuid
        REFERENCES provider_models(id) ON DELETE SET NULL,
    provider_template_id_snapshot varchar(64) NOT NULL,
    model_id_snapshot varchar(255) NOT NULL,
    operation_type varchar(16) NOT NULL DEFAULT 'chat',
    status varchar(16) NOT NULL DEFAULT 'pending',
    input_tokens integer,
    output_tokens integer,
    duration_ms integer,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,

    CONSTRAINT usage_events_principal_type_check
        CHECK (principal_type IN ('user', 'guest')),
    CONSTRAINT usage_events_principal_label_check
        CHECK (char_length(btrim(principal_label)) BETWEEN 1 AND 100),
    CONSTRAINT usage_events_operation_type_check
        CHECK (operation_type IN ('chat', 'summary')),
    CONSTRAINT usage_events_status_check
        CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    CONSTRAINT usage_events_token_check
        CHECK (
            (input_tokens IS NULL OR input_tokens >= 0)
            AND (output_tokens IS NULL OR output_tokens >= 0)
        ),
    CONSTRAINT usage_events_duration_check
        CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT usage_events_completion_check
        CHECK (
            (status = 'pending' AND completed_at IS NULL)
            OR (status <> 'pending' AND completed_at IS NOT NULL)
        )
);

CREATE INDEX usage_events_started_idx
    ON usage_events (started_at DESC);

CREATE INDEX usage_events_principal_started_idx
    ON usage_events (principal_type, principal_id, started_at DESC);

CREATE INDEX usage_events_model_started_idx
    ON usage_events (
        provider_template_id_snapshot,
        model_id_snapshot,
        started_at DESC
    );

INSERT INTO usage_events (
    assistant_message_id,
    principal_type,
    principal_id,
    principal_label,
    provider_model_id,
    provider_template_id_snapshot,
    model_id_snapshot,
    operation_type,
    status,
    input_tokens,
    output_tokens,
    duration_ms,
    started_at,
    completed_at
)
SELECT
    m.id,
    CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'guest' END,
    coalesce(c.user_id, c.guest_id),
    CASE
        WHEN c.user_id IS NOT NULL THEN u.username
        ELSE '게스트 ' || left(c.guest_id::text, 8)
    END,
    m.provider_model_id,
    m.provider_template_id_snapshot,
    m.model_id_snapshot,
    'chat',
    CASE
        WHEN m.status = 'streaming' THEN 'pending'
        ELSE m.status
    END,
    m.input_tokens,
    m.output_tokens,
    CASE
        WHEN m.status IN ('completed', 'failed', 'cancelled')
        THEN GREATEST(
            0,
            floor(
                extract(
                    epoch FROM (coalesce(m.completed_at, m.updated_at) - m.created_at)
                ) * 1000
            )::integer
        )
        ELSE NULL
    END,
    m.created_at,
    CASE
        WHEN m.status IN ('completed', 'failed', 'cancelled')
        THEN coalesce(m.completed_at, m.updated_at)
        ELSE NULL
    END
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
LEFT JOIN users u ON u.id = c.user_id
WHERE m.role = 'assistant'
  AND m.provider_template_id_snapshot IS NOT NULL
  AND m.model_id_snapshot IS NOT NULL;

INSERT INTO usage_events (
    principal_type,
    principal_id,
    principal_label,
    provider_model_id,
    provider_template_id_snapshot,
    model_id_snapshot,
    operation_type,
    status,
    input_tokens,
    output_tokens,
    started_at,
    completed_at
)
SELECT
    CASE WHEN c.user_id IS NOT NULL THEN 'user' ELSE 'guest' END,
    coalesce(c.user_id, c.guest_id),
    CASE
        WHEN c.user_id IS NOT NULL THEN u.username
        ELSE '게스트 ' || left(c.guest_id::text, 8)
    END,
    s.provider_model_id,
    s.provider_template_id_snapshot,
    s.model_id_snapshot,
    'summary',
    'completed',
    s.input_tokens,
    s.output_tokens,
    s.created_at,
    s.created_at
FROM context_summaries s
JOIN conversations c ON c.id = s.conversation_id
LEFT JOIN users u ON u.id = c.user_id;
