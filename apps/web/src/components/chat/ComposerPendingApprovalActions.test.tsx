import { act } from "react";
import { create } from "react-test-renderer";
import { i18n as testI18n } from "@t3tools/shared/i18n";
import { beforeEach as beforeI18nTest, afterEach as afterI18nTest } from "vite-plus/test";
beforeI18nTest(() => testI18n.setLocale("en"));
afterI18nTest(() => testI18n.setLocale("zh-CN"));

import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";

describe("ComposerPendingApprovalActions", () => {
  it("keeps the main decisions visible and secondary decisions in the menu", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-1")}
        isResponding={false}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).toContain(">Decline<");
    expect(markup).toContain(">Approve<");
    expect(markup).not.toContain(">Cancel<");
    expect(markup).not.toContain("Always allow this session");
  });

  it("keeps secondary provider labels out of the compact action row", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-safari")}
        isResponding={false}
        options={[
          { decision: "decline", label: "Decline" },
          { decision: "acceptAlways", label: "Always allow Safari" },
          { decision: "accept", label: "Approve" },
        ]}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).not.toContain("Always allow Safari");
    expect(markup).toContain(">Approve<");
    expect(markup).not.toContain("Always allow this session");
  });

  it("preserves provider labels for the main decisions", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("approval-1")}
        isResponding={false}
        options={[
          { decision: "accept", label: "Allow once" },
          { decision: "decline", label: "Deny" },
        ]}
        onRespondToApproval={async () => undefined}
      />,
    );

    expect(markup).toContain("Allow once");
    expect(markup).toContain("Deny");
    expect(markup).not.toContain(">Approve<");
    expect(markup).not.toContain(">Decline<");
  });
});

it("updates approval labels in place when the language switches and preserves the decision", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onRespond = vi.fn(async () => undefined);
  let renderer: ReturnType<typeof create>;
  try {
    await act(async () => {
      renderer = create(
        <ComposerPendingApprovalActions
          requestId={ApprovalRequestId.make("locale-approval")}
          isResponding={false}
          options={[{ decision: "accept", label: "Approve" }]}
          onRespondToApproval={onRespond}
        />,
      );
    });
    expect(renderer!.root.findByType("button").findByType("span").children).toEqual(["Approve"]);
    await act(async () => testI18n.setLocale("zh-CN"));
    expect(renderer!.root.findByType("button").findByType("span").children).toEqual(["批准"]);
    await act(async () => renderer!.root.findByType("button").props.onClick());
    expect(onRespond).toHaveBeenCalledWith("locale-approval", "accept");
  } finally {
    await act(async () => renderer?.unmount());
    vi.unstubAllGlobals();
  }
});
