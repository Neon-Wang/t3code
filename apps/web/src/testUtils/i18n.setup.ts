import { beforeEach, afterEach } from "vite-plus/test";
import { i18n } from "@t3tools/shared/i18n";

// Existing behavioral fixtures assert English. Locale-switch tests opt in explicitly.
beforeEach(() => i18n.setLocale("en"));
afterEach(() => i18n.setLocale("en"));
