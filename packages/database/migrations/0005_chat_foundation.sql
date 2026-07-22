CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    guest_id uuid REFERENCES guest_principals(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL DEFAULT '새 대화',
    system_prompt text NOT NULL DEFAULT '',
    history_message_limit integer NOT NULL DEFAULT 0,
    context_token_limit integer NOT NULL DEFAULT 100000,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT conversations_owner_check
        CHECK ((user_id IS NOT NULL)::integer + (guest_id IS NOT NULL)::integer = 1),
    CONSTRAINT conversations_title_check
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT conversations_system_prompt_check
        CHECK (char_length(system_prompt) <= 100000),
    CONSTRAINT conversations_history_limit_check
        CHECK (history_message_limit BETWEEN 0 AND 10000),
    CONSTRAINT conversations_context_limit_check
        CHECK (context_token_limit BETWEEN 1000 AND 2000000)
);

CREATE INDEX conversations_user_updated_idx
    ON conversations (user_id, updated_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX conversations_guest_updated_idx
    ON conversations (guest_id, updated_at DESC)
    WHERE guest_id IS NOT NULL;

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE conversation_branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_branch_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT conversation_branches_identity_unique
        UNIQUE (id, conversation_id),
    CONSTRAINT conversation_branches_parent_fk
        FOREIGN KEY (parent_branch_id, conversation_id)
        REFERENCES conversation_branches(id, conversation_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX conversation_branches_root_unique
    ON conversation_branches (conversation_id)
    WHERE parent_branch_id IS NULL;

CREATE INDEX conversation_branches_conversation_created_idx
    ON conversation_branches (conversation_id, created_at);

CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL,
    parent_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
    sequence_number integer NOT NULL,
    role varchar(16) NOT NULL,
    status varchar(16) NOT NULL,
    content text NOT NULL DEFAULT '',
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    provider_template_id_snapshot varchar(64),
    model_id_snapshot varchar(255),
    request_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    input_tokens integer,
    output_tokens integer,
    error_code varchar(64),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,

    CONSTRAINT messages_identity_unique UNIQUE (id, conversation_id),
    CONSTRAINT messages_branch_fk
        FOREIGN KEY (branch_id, conversation_id)
        REFERENCES conversation_branches(id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT messages_sequence_check CHECK (sequence_number >= 1),
    CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant', 'summary')),
    CONSTRAINT messages_status_check
        CHECK (status IN ('pending', 'streaming', 'completed', 'failed', 'cancelled')),
    CONSTRAINT messages_content_check CHECK (char_length(content) <= 2000000),
    CONSTRAINT messages_token_usage_check
        CHECK (
            (input_tokens IS NULL OR input_tokens >= 0)
            AND (output_tokens IS NULL OR output_tokens >= 0)
        ),
    CONSTRAINT messages_snapshot_check
        CHECK (
            (provider_template_id_snapshot IS NULL AND model_id_snapshot IS NULL)
            OR (provider_template_id_snapshot IS NOT NULL AND model_id_snapshot IS NOT NULL)
        ),
    CONSTRAINT messages_completed_at_check
        CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX messages_branch_sequence_unique
    ON messages (branch_id, sequence_number);

CREATE INDEX messages_conversation_created_idx
    ON messages (conversation_id, created_at);

CREATE TRIGGER messages_set_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

ALTER TABLE conversation_branches
ADD COLUMN forked_from_message_id uuid;

ALTER TABLE conversation_branches
ADD CONSTRAINT conversation_branches_fork_message_fk
FOREIGN KEY (forked_from_message_id)
REFERENCES messages(id)
ON DELETE SET NULL;

ALTER TABLE conversations
ADD COLUMN active_branch_id uuid NOT NULL;

ALTER TABLE conversations
ADD CONSTRAINT conversations_active_branch_fk
FOREIGN KEY (active_branch_id, id)
REFERENCES conversation_branches(id, conversation_id)
DEFERRABLE INITIALLY DEFERRED;
