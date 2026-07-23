ALTER TABLE attachments
    ADD COLUMN ocr_page_count integer NOT NULL DEFAULT 0;

ALTER TABLE attachments
    ADD CONSTRAINT attachments_ocr_page_count_check
        CHECK (
            ocr_page_count BETWEEN 0 AND 500
            AND (
                (file_kind = 'pdf' AND ocr_page_count <= COALESCE(page_count, 0))
                OR (file_kind <> 'pdf' AND ocr_page_count = 0)
            )
        );
