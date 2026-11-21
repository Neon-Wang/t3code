/**
 * Clerk Simplified Chinese UI messages from @clerk/localizations 4.20.0.
 * Kept with the lazy authentication boundary so local-only builds do not load them.
 * Source: https://github.com/clerk/javascript/tree/main/packages/localizations
 *
 * MIT License
 *
 * Copyright (c) 2022 Clerk, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useSyncExternalStore } from "react";
import { getI18nSnapshot, subscribeI18n } from "../../i18n/runtime";

import clerkZhCN from "./clerkZhCN.json";

const defaultLocalization = {};

export function useClerkLocalization() {
  const { locale } = useSyncExternalStore(subscribeI18n, getI18nSnapshot);
  return locale === "zh" ? clerkZhCN : defaultLocalization;
}
