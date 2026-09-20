import { defineRule } from "@oxlint/plugins";

// A control that starts at opacity-0 and is only brought back by a hover
// variant is unreachable on a coarse pointer: there is no hover, and the
// engines that synthesize one on tap do not keep it. Measured on a HarmonyOS
// tablet, tapping such a row left the control at opacity 0.
const HIDDEN = /(?:^|\s)opacity-0(?:\s|$)/u;
const HOVER_REVEALS = /(?:^|\s)(?:group-)?hover(?:\/[\w-]+)?:opacity-100(?:\s|$)/u;

// Any explicit coarse-pointer opacity counts as handled; the author has thought
// about it. Other coarse variants (pointer-events, static) do not, on their own,
// make an invisible control visible.
const COARSE_HANDLED = /(?:^|\s)pointer-coarse:opacity-\d/u;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a coarse-pointer fallback on controls that are revealed by hover, so touch devices can reach them.",
    },
  },
  create(context) {
    const check = (node: { value?: unknown }, raw: string) => {
      if (!HIDDEN.test(raw)) return;
      if (!HOVER_REVEALS.test(raw)) return;
      if (COARSE_HANDLED.test(raw)) return;

      context.report({
        node: node as never,
        message:
          "This control is hidden until hover, which a touch device can never do. Add pointer-coarse:opacity-100 (and mirror whatever else the hover variant restores, such as pointer-events-auto or static).",
      });
    };

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        check(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value.cooked ?? node.value.raw;
        if (typeof raw !== "string") return;
        check(node, raw);
      },
    };
  },
});
