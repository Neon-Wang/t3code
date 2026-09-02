#!/usr/bin/env node
/**
 * sync-upstream — vendor the upstream iOS Swift sources of T3 Code's mobile
 * native modules into harmony/vendor/swift with deterministic transforms, and
 * generate the small pure-Swift compat shims the vendored code needs.
 *
 * Deterministic outputs (same upstream tree -> byte-identical vendor tree):
 *   1. `<module>/<file>.swift` — upstream source, verbatim except:
 *      a. `import <AppleModule>` -> `import <ShimModule>` rewrites;
 *      b. selector-free: `#selector(name…)` -> `Selector("name")`,
 *         `@objc` annotations stripped (Linux/OpenHarmony have no ObjC
 *         runtime);
 *      c. required-init satisfaction injected into view class bodies
 *         (pure Swift cannot replicate ObjC automatic init inheritance);
 *      d. a `T3ActionPerformable` dispatch table appended IN THE SAME FILE
 *         (private classes/methods are reachable from same-file extensions).
 *   2. `<module>/T3HarmonySupport.generated.swift` — cross-module
 *      construction factory.
 *
 * Usage:
 *   node harmony/tools/sync-upstream.mjs            # sync (writes vendor/ + manifest)
 *   node harmony/tools/sync-upstream.mjs --check    # exit 1 if vendor/ is stale
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const harmonyRoot = join(scriptDir, "..");
const repoRoot = execFileSync("git", ["-C", harmonyRoot, "rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const vendorRoot = join(harmonyRoot, "vendor", "swift");

const MODULES = {
  "t3-terminal": { source: "apps/mobile/modules/t3-terminal/ios" },
  "t3-review-diff": { source: "apps/mobile/modules/t3-review-diff/ios" },
  "t3-composer-editor": { source: "apps/mobile/modules/t3-composer-editor/ios" },
  "t3-native-controls": { source: "apps/mobile/modules/t3-native-controls/ios" },
};

const IMPORT_REWRITES = new Map([
  ["ExpoModulesCore", "T3ExpoModulesCore"],
  ["UIKit", "T3UIKit"],
  ["QuartzCore", "T3QuartzCore"],
  ["GhosttyKit", "T3GhosttyKit"],
  ["QuickLook", "T3QuickLook"],
  ["AVKit", "T3AVKit"],
  ["ImageIO", "T3ImageIO"],
  ["Security", "T3ExpoModulesCore"],
  ["UniformTypeIdentifiers", "T3UniformTypeIdentifiers"],
]);

const IMPORT_PATTERN =
  /^(?<prefix>@preconcurrency |@_implementationOnly |@testable )?import\s+(?<module>[A-Za-z_][A-Za-z0-9_]*)\s*(?:#.*)?$/;

const CLASS_PATTERN =
  /^(?:@\w+\s+)*(?:private |public |open |internal )*(?:final )?class\s+(\w+)\s*:\s*([^{]+?)(?:\s*where[^\{]*)?\s*\{?\s*$/;

const FUNC_PATTERN =
  /^\s*(?:private |public |open |internal |fileprivate )*(?:final )?(?:override )?(?:convenience |static |class )*func\s+([A-Za-z_]\w*)\s*\(\s*(?:_\s+\w+\s*:\s*([^),]+))?[^)]*\)/;

const OBJC_INLINE_PATTERN =
  /@objc\s+(?=(?:private|public|open|internal|final|func|var|class|extension|override)\b)/;

const SELECTOR_PATTERN = /#selector\(\s*(?:[A-Za-z_]\w*\.)?([A-Za-z_]\w*)\s*(?:\([^()]*\))?\s*\)/g;

const CODER_SATISFACTION_SUPERS = ["ExpoView"];

/**
 * Host-compiler workaround (Swift 6.3 diagnostic crash): an array literal of
 * imported CFString constants inside a result-builder closure fails type
 * checking outright; iterating an imported [CFString] value compiles.
 */
const STATEMENT_REWRITES = [
  [
    "in [kSecClassGenericPassword, kSecClassInternetPassword]",
    "in T3ExpoModulesCore.t3KeychainClassConstants",
  ],
  // NSTextAttachment 的 shim 只保留 coder designated init（Linux corelibs 的
  // NSAttributedString designated init 需要 string/coder，无参存储初始化不可用）。
  ["super.init(data: nil, ofType: nil)", "super.init(attachmentPlaceholder: ())"],
  // Linux corelibs 的 designated init 需要显式参数。
  ["let source = NSMutableString()", "let source = NSMutableString(capacity: 0)"],
  [
    "let result = NSMutableAttributedString()",
    'let result = NSMutableAttributedString(string: "")',
  ],
];

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function gitRepoState() {
  const commit = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  let remote = "";
  try {
    remote = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
  } catch {
    remote = "";
  }
  const dirty = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .some(
      (line) => line.includes("apps/mobile/modules/") || line.includes("native/libghostty-vt/"),
    );
  return { commit, remote, sourceTreeDirty: dirty };
}

function listSwiftFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSwiftFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".swift")) files.push(path);
  }
  return files;
}

// ---------------------------------------------------------------------------
// selector-free 动作表：从 ORIGINAL 源解析类栈与 @objc 方法签名。

function countChar(line, character) {
  let count = 0;
  for (const ch of line) {
    if (ch === character) count += 1;
  }
  return count;
}

function renderActionTables(originalSource) {
  const lines = originalSource.split("\n");
  const classStack = [];
  const classMethods = new Map();

  const ensure = (name) => {
    if (!classMethods.has(name)) classMethods.set(name, new Map());
    return classMethods.get(name);
  };

  let depth = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const classMatch = CLASS_PATTERN.exec(trimmed);
    if (classMatch && trimmed.endsWith("{")) {
      // baseline = 该类开括号计入后的深度；深度跌破 baseline 即类体结束。
      classStack.push({ name: classMatch[1], baseline: depth + countChar(line, "{") });
      ensure(classMatch[1]);
    }

    const previous = index > 0 ? lines[index - 1] : "";
    const objcAnnotated =
      trimmed.includes("@objc") ||
      previous.trim() === "@objc" ||
      previous.trim().startsWith("@objc ");
    const funcMatch = FUNC_PATTERN.exec(line);
    if (objcAnnotated && funcMatch && classStack.length > 0) {
      const owner = classStack[classStack.length - 1];
      ensure(owner.name).set(funcMatch[1], (funcMatch[2] ?? "").trim() || null);
    }

    // 也收录被 #selector 引用但未标 @objc 的方法（如 paste 覆写）。
    SELECTOR_PATTERN.lastIndex = 0;
    let selectorMatch;
    while ((selectorMatch = SELECTOR_PATTERN.exec(line)) !== null) {
      const name = selectorMatch[1];
      for (const entry of classStack) {
        const declaration = lines.find((candidate) =>
          new RegExp(`func\\s+${name}\\s*\\(`).test(candidate),
        );
        if (declaration) {
          const paramMatch = new RegExp(
            `func\\s+${name}\\s*\\(\\s*_\\s+\\w+\\s*:\\s*([^),]+)`,
          ).exec(declaration);
          ensure(entry.name).set(name, paramMatch ? paramMatch[1].trim() : null);
        }
      }
    }

    const delta = countChar(line, "{") - countChar(line, "}");
    depth += delta;
    while (classStack.length > 0 && depth < classStack[classStack.length - 1].baseline) {
      classStack.pop();
    }
  }

  const tables = [];
  for (const [className, methods] of classMethods) {
    if (methods.size === 0) continue;
    const cases = [...methods.entries()]
      .map(([name, paramType]) =>
        paramType
          ? `    case "${name}": ${name}(argument as! ${paramType})`
          : `    case "${name}": ${name}()`,
      )
      .join("\n");
    tables.push(
      [
        "",
        "// —— Generated by sync-upstream.mjs: selector-free 动作分发表 ——",
        `extension ${className}: T3ActionPerformable {`,
        "  public func t3Perform(_ action: Selector, _ argument: Any?) {",
        "    switch action.t3Name {",
        cases,
        "    default: break",
        "    }",
        "  }",
        "}",
      ].join("\n"),
    );
  }
  return tables;
}

// ---------------------------------------------------------------------------
// 源变换

function transformSwiftSource(source, injectedClasses) {
  const injected = new Set(injectedClasses ?? []);
  const lines = source.split("\n");
  let touched = false;
  const out = [];
  for (const line of lines) {
    let current = line;

    const match = IMPORT_PATTERN.exec(current);
    if (match) {
      const target = IMPORT_REWRITES.get(match.groups.module);
      if (target) {
        touched = true;
        current = `${match.groups.prefix ?? ""}import ${target}`;
      }
    }

    if (current.trim() === "@objc") {
      touched = true;
      continue;
    }
    if (OBJC_INLINE_PATTERN.test(current)) {
      touched = true;
      current = current.replace(OBJC_INLINE_PATTERN, "");
    }
    if (current.includes("#selector(")) {
      touched = true;
      current = current.replace(SELECTOR_PATTERN, (_all, name) => `Selector("${name}")`);
    }
    for (const [pattern, replacement] of STATEMENT_REWRITES) {
      if (current.includes(pattern)) {
        touched = true;
        current = current.replace(pattern, replacement);
      }
    }

    out.push(current);

    const classMatch = CLASS_PATTERN.exec(current.trim());
    if (classMatch && injected.has(classMatch[1])) {
      out.push(
        "  public required convenience init?(coder: NSCoder) { self.init(appContext: nil) }",
      );
    }
  }
  return { source: out.join("\n"), touched };
}

function moduleClasses(renderedSource) {
  const result = { modules: [], expoViews: [] };
  for (const line of renderedSource.split("\n")) {
    const match = CLASS_PATTERN.exec(line.trim());
    if (!match) continue;
    if (/\bModule\b/.test(match[2])) result.modules.push(match[1]);
    if (CODER_SATISFACTION_SUPERS.some((base) => match[2].includes(base)))
      result.expoViews.push(match[1]);
  }
  result.modules = [...new Set(result.modules)];
  result.expoViews = [...new Set(result.expoViews)];
  return result;
}

function renderGeneratedSupport(moduleName, classes) {
  return [
    "// Generated by harmony/tools/sync-upstream.mjs — do not edit.",
    "import Foundation",
    "import T3ExpoModulesCore",
    "",
    `/// Cross-module construction point for the vendored ${moduleName} module`,
    `/// (the vendored classes keep their implicit internal initializers).`,
    "public enum T3HarmonySupport {",
    "  public static func createModules() -> [Module] {",
    `    ${classes.modules.length ? `[${classes.modules.map((name) => `${name}()`).join(", ")}]` : "[]"}`,
    "  }",
    "}",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// plan / write / check

function buildSyncPlan() {
  const state = gitRepoState();
  const files = [];
  const renderedContents = new Map();
  const modulesByModule = {};

  for (const [moduleName, config] of Object.entries(MODULES)) {
    const sourceDir = join(repoRoot, config.source);
    const classes = { modules: [], expoViews: [], actionTables: 0 };
    for (const absolutePath of listSwiftFiles(sourceDir)) {
      const repoRelative = relative(repoRoot, absolutePath);
      const original = readFileSync(absolutePath, "utf8");
      const detected = moduleClasses(original);
      classes.modules.push(...detected.modules);
      classes.expoViews.push(...detected.expoViews);

      let transformed = transformSwiftSource(original, detected.expoViews).source;
      const tables = renderActionTables(original);
      if (tables.length > 0) {
        transformed = transformed.replace(/\n$/, "") + "\n" + tables.join("\n") + "\n";
        classes.actionTables += tables.length;
      }
      renderedContents.set(repoRelative, transformed);
      files.push({
        module: moduleName,
        source: repoRelative,
        dest: relative(sourceDir, absolutePath),
        upstreamSha256: sha256(original),
        vendoredSha256: sha256(transformed),
      });
    }
    modulesByModule[moduleName] = {
      modules: [...new Set(classes.modules)],
      expoViews: [...new Set(classes.expoViews)],
      actionTables: classes.actionTables,
    };
  }

  const generated = [];
  for (const [moduleName, classes] of Object.entries(modulesByModule)) {
    const content = renderGeneratedSupport(moduleName, classes);
    generated.push({
      module: moduleName,
      dest: "T3HarmonySupport.generated.swift",
      content,
      sha256: sha256(content),
    });
  }

  return { state, files, generated, modulesByModule, renderedContents };
}

function writeVendor(plan) {
  rmSync(vendorRoot, { recursive: true, force: true });
  const manifest = {
    generatedBy: "harmony/tools/sync-upstream.mjs",
    upstream: plan.state,
    rewrites: Object.fromEntries(IMPORT_REWRITES),
    files: plan.files,
    generated: plan.generated.map((entry) => ({
      module: entry.module,
      dest: entry.dest,
      sha256: entry.sha256,
    })),
  };
  for (const entry of plan.files) {
    const destDir = join(vendorRoot, entry.module, dirname(entry.dest));
    mkdirSync(destDir, { recursive: true });
    const renderedText = plan.renderedContents.get(entry.source);
    if (renderedText === undefined || sha256(renderedText) !== entry.vendoredSha256) {
      throw new Error(`plan 与 rendered 内容不一致: ${entry.source}`);
    }
    writeFileSync(join(vendorRoot, entry.module, entry.dest), renderedText);
  }
  for (const entry of plan.generated) {
    writeFileSync(join(vendorRoot, entry.module, entry.dest), entry.content);
  }
  writeFileSync(
    join(harmonyRoot, "vendor", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function checkVendor(plan) {
  let stale = false;
  if (!readdirSync(harmonyRoot).includes("vendor")) {
    console.error("vendor/swift is missing; run sync-upstream");
    return false;
  }
  const expected = new Map([
    ...plan.files.map((entry) => [`${entry.module}/${entry.dest}`, entry.vendoredSha256]),
    ...plan.generated.map((entry) => [`${entry.module}/${entry.dest}`, entry.sha256]),
  ]);
  const present = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".swift")) present.add(relative(vendorRoot, path));
    }
  };
  walk(vendorRoot);
  for (const [relativePath, digest] of expected) {
    if (!present.has(relativePath)) {
      console.error(`missing: vendor/swift/${relativePath}`);
      stale = true;
      continue;
    }
    if (sha256(readFileSync(join(vendorRoot, relativePath), "utf8")) !== digest) {
      console.error(`stale: vendor/swift/${relativePath}`);
      stale = true;
    }
  }
  for (const relativePath of present) {
    if (!expected.has(relativePath)) {
      console.error(`orphan: vendor/swift/${relativePath}`);
      stale = true;
    }
  }
  return !stale;
}

const checkOnly = process.argv.includes("--check");
const plan = buildSyncPlan();
if (checkOnly) {
  const ok = checkVendor(plan);
  console.log(ok ? "vendor/swift is up to date" : "vendor/swift is out of date; run sync-upstream");
  process.exit(ok ? 0 : 1);
} else {
  writeVendor(plan);
  console.log(
    `synced ${plan.files.length} Swift files from ${plan.state.commit.slice(0, 12)} ` +
      `(${plan.state.sourceTreeDirty ? "dirty source tree" : "clean"}) into harmony/vendor/swift`,
  );
  for (const [moduleName, classes] of Object.entries(plan.modulesByModule)) {
    console.log(
      `  ${moduleName}: modules=[${classes.modules.join(", ")}] coderInits=[${classes.expoViews.join(", ")}] actionTables=${classes.actionTables}`,
    );
  }
}
