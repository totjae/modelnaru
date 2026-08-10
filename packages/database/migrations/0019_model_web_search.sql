ALTER TABLE provider_models
  ADD COLUMN supports_web_search boolean NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN web_search_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN provider_models.supports_web_search IS
  'Administrator-confirmed capability for provider-hosted web search.';

COMMENT ON COLUMN conversations.web_search_enabled IS
  'Whether provider-hosted web search is requested for this conversation.';
