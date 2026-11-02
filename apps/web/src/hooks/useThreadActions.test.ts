import { i18n } from "@t3tools/shared/i18n";
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vite-plus/test";

// Assertions read the English catalog; the app default is zh-CN.
beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale("zh-CN"));

import { navigateAfterThreadDeletion } from "./useThreadActions";
import { toastManager } from "../components/ui/toast";

describe("navigateAfterThreadDeletion", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports a rejected navigation without failing the completed deletion", async () => {
    const addToast = vi.spyOn(toastManager, "add").mockReturnValue("navigation-error");

    await expect(
      navigateAfterThreadDeletion(() => Promise.reject(new Error("route unavailable"))),
    ).resolves.toBeUndefined();

    expect(addToast).toHaveBeenCalledOnce();
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Thread deleted, but navigation failed",
        description: "route unavailable",
      }),
    );
  });
});
