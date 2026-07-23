ALTER TABLE attachments
    ADD COLUMN image_width integer,
    ADD COLUMN image_height integer;

ALTER TABLE attachments
    ADD CONSTRAINT attachments_image_dimensions_check
        CHECK (
            (image_width IS NULL AND image_height IS NULL)
            OR (
                image_width BETWEEN 1 AND 100000
                AND image_height BETWEEN 1 AND 100000
            )
        ),
    ADD CONSTRAINT attachments_ready_image_check
        CHECK (
            file_kind <> 'image'
            OR status <> 'ready'
            OR (
                image_width IS NOT NULL
                AND image_height IS NOT NULL
                AND extracted_text IS NULL
                AND text_encoding IS NULL
                AND page_count IS NULL
            )
        );

ALTER TABLE provider_models
    ADD COLUMN supports_image_input boolean NOT NULL DEFAULT false;
