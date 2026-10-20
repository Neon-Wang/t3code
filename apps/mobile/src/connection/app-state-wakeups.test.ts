import { describe, expect, it } from "@effect/vitest";

import {
  MOBILE_BACKGROUND_RECONNECT_AFTER_MS,
  mobileApplicationActiveWakeup,
} from "./app-state-wakeups";

describe("mobileApplicationActiveWakeup", () => {
  it("uses a fast probe after a short interruption", () => {
    expect(mobileApplicationActiveWakeup(null, 20_000)).toBe("application-active-probe");
    expect(
      mobileApplicationActiveWakeup(20_000, 20_000 + MOBILE_BACKGROUND_RECONNECT_AFTER_MS - 1),
    ).toBe("application-active-probe");
  });

  it("replaces the session after a meaningful background suspension", () => {
    expect(
      mobileApplicationActiveWakeup(20_000, 20_000 + MOBILE_BACKGROUND_RECONNECT_AFTER_MS),
    ).toBe("application-active-reconnect");
  });
  it("probes a live user-enabled background connection after a long interruption", () => {
    expect(mobileApplicationActiveWakeup(20_000, 90_000, true)).toBe("application-active-probe");
  });

  it("replaces a suspended connection when the service has stopped", () => {
    expect(mobileApplicationActiveWakeup(20_000, 90_000, false)).toBe(
      "application-active-reconnect",
    );
  });
});
