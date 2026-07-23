ALTER TABLE conversations
    ADD COLUMN default_provider_model_id uuid
        REFERENCES provider_models(id) ON DELETE SET NULL,
    ADD COLUMN generation_parameters jsonb NOT NULL
        DEFAULT '{"temperature": 1}'::jsonb,
    ADD CONSTRAINT conversations_generation_parameters_object_check
        CHECK (jsonb_typeof(generation_parameters) = 'object');

WITH latest AS (
    SELECT DISTINCT ON (c.id)
        c.id AS conversation_id,
        m.provider_model_id,
        m.request_parameters
    FROM conversations c
    JOIN messages m
      ON m.conversation_id = c.id
     AND m.branch_id = c.active_branch_id
    WHERE m.role = 'assistant'
      AND m.provider_model_id IS NOT NULL
    ORDER BY c.id, m.sequence_number DESC
)
UPDATE conversations c
SET
    default_provider_model_id = latest.provider_model_id,
    generation_parameters = latest.request_parameters
FROM latest
WHERE latest.conversation_id = c.id;
