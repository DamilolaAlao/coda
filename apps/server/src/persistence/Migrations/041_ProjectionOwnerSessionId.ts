import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projectColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_projects)
  `;
  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!projectColumns.some((column) => column.name === "owner_session_id")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN owner_session_id TEXT
    `;
  }

  if (!threadColumns.some((column) => column.name === "owner_session_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN owner_session_id TEXT
    `;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS projection_projects_owner_session_id_idx
    ON projection_projects (owner_session_id)
    WHERE owner_session_id IS NOT NULL
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS projection_threads_owner_session_id_idx
    ON projection_threads (owner_session_id)
    WHERE owner_session_id IS NOT NULL
  `;
});
