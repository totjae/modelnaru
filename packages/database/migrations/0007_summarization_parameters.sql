ALTER TABLE summarization_settings
    ADD COLUMN temperature double precision,
    ADD COLUMN top_p double precision,
    ADD CONSTRAINT summarization_settings_temperature_check
        CHECK (temperature IS NULL OR temperature BETWEEN 0 AND 2),
    ADD CONSTRAINT summarization_settings_top_p_check
        CHECK (top_p IS NULL OR top_p BETWEEN 0 AND 1);
