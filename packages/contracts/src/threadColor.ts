import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const ThreadColor = Schema.Literals([
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "gray",
]);
export type ThreadColor = typeof ThreadColor.Type;

export const StoredThreadColor = Schema.NullOr(ThreadColor).pipe(
  Schema.catchDecoding(() => Effect.succeedSome(null)),
);
