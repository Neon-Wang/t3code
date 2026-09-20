import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/require-coarse-pointer-reveal", {
  filename: "fixture.tsx",
});

describe("t3code/require-coarse-pointer-reveal", () => {
  rule.valid(
    "allows a hover reveal that also shows on a coarse pointer",
    `const el = <button className="opacity-0 transition-opacity hover:opacity-100 pointer-coarse:opacity-100" />;`,
  );

  rule.valid(
    "allows a group-hover reveal with the coarse fallback",
    `const el = <span className="opacity-0 group-hover/row:opacity-100 pointer-coarse:opacity-100" />;`,
  );

  rule.valid(
    "ignores hover styling that is not a reveal",
    `const el = <button className="opacity-70 hover:opacity-100" />;`,
  );

  rule.valid(
    "ignores a hidden control with no hover reveal at all",
    `const el = <span className="opacity-0 transition-opacity" />;`,
  );

  rule.valid(
    "does not match opacity-0 inside a longer token",
    `const el = <span className="disabled:opacity-64 hover:opacity-100" />;`,
  );

  rule.invalid(
    "reports a hover-only reveal",
    `const el = <button className="opacity-0 transition-opacity hover:opacity-100" />;`,
    (output) => {
      assert.match(output, /pointer-coarse:opacity-100/);
    },
  );

  rule.invalid(
    "reports a named group-hover reveal",
    `const el = <span className="pointer-events-none opacity-0 group-hover/sidebar-row:opacity-100" />;`,
    (output) => {
      assert.match(output, /touch device can never do/);
    },
  );

  rule.invalid(
    "reports inside a template literal",
    "const cls = `opacity-0 hover:opacity-100 ${extra}`;",
    (output) => {
      assert.match(output, /pointer-coarse:opacity-100/);
    },
  );
});
