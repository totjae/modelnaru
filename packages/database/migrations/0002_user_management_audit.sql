CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_type varchar(16) NOT NULL,
    actor_id varchar(128),
    action varchar(64) NOT NULL,
    target_type varchar(64) NOT NULL,
    target_id uuid,
    before_data jsonb,
    after_data jsonb,
    reason varchar(500),
    ip_hash bytea,
    user_agent_summary varchar(255),
    request_id uuid,

    CONSTRAINT audit_logs_actor_type_check
        CHECK (actor_type IN ('admin', 'system')),
    CONSTRAINT audit_logs_action_check
        CHECK (action ~ '^[a-z][a-z0-9_.-]{2,63}$'),
    CONSTRAINT audit_logs_target_type_check
        CHECK (target_type ~ '^[a-z][a-z0-9_.-]{1,63}$'),
    CONSTRAINT audit_logs_ip_hash_length_check
        CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32)
);

CREATE INDEX audit_logs_occurred_at_idx
    ON audit_logs (occurred_at DESC);

CREATE INDEX audit_logs_target_idx
    ON audit_logs (target_type, target_id, occurred_at DESC);
