CREATE TABLE chat_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name varchar(100) NOT NULL CHECK (length(trim(name)) > 0),
 description varchar(1000) NOT NULL DEFAULT '',
 is_enabled boolean NOT NULL DEFAULT true,
 provider_model_id uuid,
 settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
 version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
