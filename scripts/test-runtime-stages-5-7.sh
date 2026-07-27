#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(dirname -- "$SCRIPT_DIR")
CONVERSATION_ID=${1:-}

cd "$PROJECT_ROOT"

printf '%s\n' '[1/5] Container 상태 확인'
docker compose ps

printf '%s\n' '[2/5] 5·6·7단계 API 단위·회귀시험'
docker compose exec -T api \
  pnpm exec vitest run \
  test/request-trace.service.test.ts \
  test/chats.controller.test.ts \
  test/chats.service.test.ts \
  test/provider-discovery.test.ts

printf '%s\n' '[3/5] 6·7단계 Web pagination·최신 요청 시험'
docker compose exec -T web \
  pnpm exec vitest run \
  test/chat-message-pagination.test.ts \
  test/chat-response-navigation.test.ts \
  test/latest-request.test.ts

if [ -z "$CONVERSATION_ID" ]; then
  CONVERSATION_ID=$(
    docker compose exec -T postgres \
      psql -U modelnaru -d modelnaru -At \
      -c "SELECT c.id
          FROM conversations c
          ORDER BY (
            SELECT count(*) FROM messages m WHERE m.conversation_id = c.id
          ) DESC, c.updated_at DESC
          LIMIT 1;"
  )
fi

if [ -n "$CONVERSATION_ID" ]; then
  printf '%s\n' "[4/5] 활성 분기 진단: $CONVERSATION_ID"
  docker compose exec -T postgres \
    psql -U modelnaru -d modelnaru \
    -v conversation_id="$CONVERSATION_ID" <<'SQL'
WITH RECURSIVE selected_conversation AS (
  SELECT id, title, active_branch_id
  FROM conversations
  WHERE id = :'conversation_id'::uuid
),
active_path AS (
  SELECT b.id, b.parent_branch_id, b.forked_from_message_id,
         NULL::integer AS before_sequence
  FROM conversation_branches b
  JOIN selected_conversation c ON c.active_branch_id = b.id

  UNION ALL

  SELECT parent.id, parent.parent_branch_id,
         parent.forked_from_message_id, fork.sequence_number
  FROM active_path child
  JOIN conversation_branches parent ON parent.id = child.parent_branch_id
  JOIN messages fork ON fork.id = child.forked_from_message_id
),
active_messages AS (
  SELECT m.id, m.sequence_number
  FROM active_path path
  JOIN messages m ON m.branch_id = path.id
  WHERE path.before_sequence IS NULL
     OR m.sequence_number < path.before_sequence
)
SELECT c.title,
       (SELECT count(*) FROM conversation_branches b
        WHERE b.conversation_id = c.id) AS total_branches,
       (SELECT count(*) FROM messages m
        WHERE m.conversation_id = c.id) AS all_branch_messages,
       (SELECT count(*) FROM active_messages) AS active_path_messages,
       LEAST((SELECT count(*) FROM active_messages), 50) AS initial_page_size,
       (SELECT count(*) FROM active_messages) > 50 AS has_older_page
FROM selected_conversation c;
SQL
else
  printf '%s\n' '[4/5] 저장된 대화가 없어 활성 분기 진단을 건너뜁니다.'
fi

printf '%s\n' '[5/5] Gateway·API health 확인'
docker compose exec -T gateway \
  wget --quiet -O- http://127.0.0.1:8080/api/health/ready
printf '\n%s\n' '5·6·7단계 자동 점검 완료'
