ALTER TABLE attachments
    ADD COLUMN page_count integer;

ALTER TABLE attachments
    ADD CONSTRAINT attachments_page_count_check
        CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 500),
    ADD CONSTRAINT attachments_ready_pdf_check
        CHECK (
            file_kind <> 'pdf'
            OR status <> 'ready'
            OR (
                extracted_text IS NOT NULL
                AND page_count IS NOT NULL
                AND text_encoding IS NULL
            )
        );
