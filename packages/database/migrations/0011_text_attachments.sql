CREATE TABLE attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id uuid,
    original_name varchar(255) NOT NULL,
    media_type varchar(255) NOT NULL,
    file_kind varchar(16) NOT NULL,
    byte_size bigint NOT NULL,
    storage_key varchar(128) NOT NULL UNIQUE,
    extracted_text text,
    text_encoding varchar(32),
    include_in_future_messages boolean NOT NULL DEFAULT false,
    status varchar(16) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,

    CONSTRAINT attachments_message_fk
        FOREIGN KEY (message_id, conversation_id)
        REFERENCES messages(id, conversation_id)
        ON DELETE CASCADE,
    CONSTRAINT attachments_name_check
        CHECK (char_length(btrim(original_name)) BETWEEN 1 AND 255),
    CONSTRAINT attachments_media_type_check
        CHECK (char_length(btrim(media_type)) BETWEEN 1 AND 255),
    CONSTRAINT attachments_kind_check
        CHECK (file_kind IN ('text', 'pdf', 'image')),
    CONSTRAINT attachments_size_check
        CHECK (byte_size BETWEEN 1 AND 1073741824),
    CONSTRAINT attachments_storage_key_check
        CHECK (storage_key ~ '^[0-9a-f]{2}/[0-9a-f-]{36}$'),
    CONSTRAINT attachments_text_length_check
        CHECK (extracted_text IS NULL OR char_length(extracted_text) <= 2000000),
    CONSTRAINT attachments_status_check
        CHECK (status IN ('processing', 'ready', 'failed')),
    CONSTRAINT attachments_ready_text_check
        CHECK (
            file_kind <> 'text'
            OR status <> 'ready'
            OR (extracted_text IS NOT NULL AND text_encoding IS NOT NULL)
        )
);

CREATE INDEX attachments_conversation_created_idx
    ON attachments (conversation_id, created_at);

CREATE INDEX attachments_message_idx
    ON attachments (message_id)
    WHERE message_id IS NOT NULL;

CREATE INDEX attachments_expiry_idx
    ON attachments (expires_at)
    WHERE status <> 'processing';
