import { i18n } from "@t3tools/shared/i18n";
import { EnvironmentId } from "@t3tools/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

// Assertions read the English catalog; the app default is zh-CN.
beforeAll(() => i18n.setLocale("en"));
afterAll(() => i18n.setLocale("zh-CN"));

import { attachmentUploadBlockReason } from "./attachmentUploadState";

const environmentId = EnvironmentId.make("environment-1");

describe("attachmentUploadBlockReason", () => {
  it("does not accept an upload from another environment", () => {
    expect(
      attachmentUploadBlockReason({
        imageIds: ["image-1"],
        environmentId,
        uploadsByImageId: {
          "image-1": {
            status: "ready",
            environmentId: EnvironmentId.make("environment-2"),
            attachmentId: "pending-1",
          },
        },
      }),
    ).toBe("Attachment still uploading");
  });
});
