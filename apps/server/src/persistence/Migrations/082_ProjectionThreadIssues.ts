import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE projection_thread_issues (
    thread_id TEXT NOT NULL REFERENCES orchestration_v2_projection_threads(thread_id) ON DELETE CASCADE,
    host TEXT NOT NULL,
    repository TEXT NOT NULL,
    number INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (thread_id, host, repository, number)
  )`;
  yield* sql`CREATE INDEX projection_thread_issues_remote ON projection_thread_issues(host, repository, number)`;
});
