CREATE TABLE summarization_settings (
    singleton boolean PRIMARY KEY DEFAULT true,
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    prompt text NOT NULL DEFAULT '이전 대화를 이후 답변에 사용할 수 있도록 간결하게 요약하세요. 중요한 사실, 사용자 선호, 결정 사항, 제약 조건과 미해결 작업을 보존하고 추측을 추가하지 마세요. 요약문만 출력하세요.',
    prompt_version integer NOT NULL DEFAULT 1,
    max_output_tokens integer NOT NULL DEFAULT 2048,
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT summarization_settings_singleton_check CHECK (singleton = true),
    CONSTRAINT summarization_settings_prompt_check
        CHECK (char_length(btrim(prompt)) BETWEEN 20 AND 20000),
    CONSTRAINT summarization_settings_version_check CHECK (prompt_version >= 1),
    CONSTRAINT summarization_settings_output_check
        CHECK (max_output_tokens BETWEEN 128 AND 32768)
);

INSERT INTO summarization_settings (singleton) VALUES (true);

CREATE TRIGGER summarization_settings_set_updated_at
BEFORE UPDATE ON summarization_settings
FOR EACH ROW
EXECUTE FUNCTION modelnaru_set_updated_at();

CREATE TABLE context_summaries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL,
    first_message_id uuid NOT NULL,
    last_message_id uuid NOT NULL,
    provider_model_id uuid REFERENCES provider_models(id) ON DELETE SET NULL,
    provider_template_id_snapshot varchar(64) NOT NULL,
    model_id_snapshot varchar(255) NOT NULL,
    prompt_version integer NOT NULL,
    covered_message_count integer NOT NULL,
    summary text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT context_summaries_branch_fk
        FOREIGN KEY (branch_id, conversation_id)
        REFERENCES conversation_branches(id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT context_summaries_first_message_fk
        FOREIGN KEY (first_message_id, conversation_id)
        REFERENCES messages(id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT context_summaries_last_message_fk
        FOREIGN KEY (last_message_id, conversation_id)
        REFERENCES messages(id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT context_summaries_version_check CHECK (prompt_version >= 1),
    CONSTRAINT context_summaries_count_check CHECK (covered_message_count >= 1),
    CONSTRAINT context_summaries_content_check
        CHECK (char_length(btrim(summary)) BETWEEN 1 AND 2000000),
    CONSTRAINT context_summaries_usage_check
        CHECK (
            (input_tokens IS NULL OR input_tokens >= 0)
            AND (output_tokens IS NULL OR output_tokens >= 0)
        )
);

CREATE INDEX context_summaries_conversation_created_idx
    ON context_summaries (conversation_id, created_at DESC);

CREATE INDEX context_summaries_last_message_idx
    ON context_summaries (conversation_id, last_message_id);

CREATE UNIQUE INDEX context_summaries_generation_unique
    ON context_summaries (
        conversation_id,
        branch_id,
        last_message_id,
        prompt_version,
        provider_model_id
    )
    WHERE provider_model_id IS NOT NULL;
