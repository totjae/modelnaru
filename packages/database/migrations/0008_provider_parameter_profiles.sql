ALTER TABLE summarization_settings
    ADD COLUMN provider_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD CONSTRAINT summarization_settings_provider_parameters_object_check
        CHECK (jsonb_typeof(provider_parameters) = 'object');
