import Foundation
import T3Bridge
import T3CoreGraphics
import T3UIKit
import T3ExpoModulesCore
import VendoredT3ReviewDiff
import VendoredT3ComposerEditor
import VendoredT3Terminal
import VendoredT3NativeControls

// The public product surface: one registration entry point and re-exports of
// the bridge vocabulary. The vendored modules register their own declarative
// surfaces; nothing in this file knows a module-specific name.

@_exported import T3Bridge

extension T3BridgeRegistry {
  /// Register every vendored upstream module (construction goes through the
  /// generated support files, which keep the vendored classes untouched).
  /// Idempotent.
  public func registerVendoredModules() -> [String] {
    let factories: [() -> [Module]] = [
      VendoredT3ReviewDiff.T3HarmonySupport.createModules,
      VendoredT3ComposerEditor.T3HarmonySupport.createModules,
      VendoredT3Terminal.T3HarmonySupport.createModules,
      VendoredT3NativeControls.T3HarmonySupport.createModules,
    ]
    var names: [String] = []
    for factory in factories {
      for module in factory() {
        if let name = register(module) {
          names.append(name)
        }
      }
    }
    return names
  }
}
