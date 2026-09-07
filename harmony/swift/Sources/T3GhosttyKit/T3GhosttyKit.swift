import Foundation
import T3CoreGraphics

// T3GhosttyKit — the GhosttyKit surface API the upstream terminal view links
// against, expressed as pure Swift over an injectable engine.
//
// On iOS the real GhosttyKit renders into a UIView-backed surface. On
// OpenHarmony the engine is implemented on top of libghostty-vt (the same C
// library the upstream Android implementation links), streaming snapshot
// frames out for the ArkUI canvas. On the host, no engine is installed and the
// vendored view follows its own "surface creation failed" path, which keeps
// the estimated-resize logic testable.

// MARK: - Handles & platform constants

public final class ghostty_app_t {}
public final class ghostty_surface_t {}
public final class ghostty_config_t {}

public enum GhosttyPlatform: UInt32 {
  case macos = 0
  case ios = 1
}

public let GHOSTTY_PLATFORM_IOS = GhosttyPlatform.ios

public enum GhosttySurfaceContext: UInt32 {
  case window = 0
  case terminal = 1
}

public let GHOSTTY_SURFACE_CONTEXT_WINDOW = GhosttySurfaceContext.window

public struct GhosttyMods: OptionSet, Sendable {
  public let rawValue: UInt32
  public init(rawValue: UInt32) { self.rawValue = rawValue }
  public static let none = GhosttyMods(rawValue: 0)
}

public let GHOSTTY_MODS_NONE = GhosttyMods.none

// MARK: - Config shapes

public struct ghostty_runtime_config_s {
  public var userdata: UnsafeMutableRawPointer?
  public var supports_selection_clipboard: Bool
  public var wakeup_cb: ((UnsafeMutableRawPointer?) -> Void)?
  public var action_cb: ((UnsafeMutableRawPointer?, UnsafePointer<CChar>?, UnsafeMutableRawPointer?) -> Bool)?
  public var read_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, UnsafeMutablePointer<Int>?) -> Bool)?
  public var confirm_read_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, Int, UnsafeMutableRawPointer?) -> Void)?
  public var write_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, UnsafeMutablePointer<UInt8>?, Int, Bool) -> Void)?
  public var close_surface_cb: ((UnsafeMutableRawPointer?, Bool) -> Void)?

  public init(
    userdata: UnsafeMutableRawPointer?,
    supports_selection_clipboard: Bool,
    wakeup_cb: ((UnsafeMutableRawPointer?) -> Void)?,
    action_cb: ((UnsafeMutableRawPointer?, UnsafePointer<CChar>?, UnsafeMutableRawPointer?) -> Bool)?,
    read_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, UnsafeMutablePointer<Int>?) -> Bool)?,
    confirm_read_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, Int, UnsafeMutableRawPointer?) -> Void)?,
    write_clipboard_cb: ((UnsafeMutableRawPointer?, UnsafeMutableRawPointer?, UnsafeMutablePointer<UInt8>?, Int, Bool) -> Void)?,
    close_surface_cb: ((UnsafeMutableRawPointer?, Bool) -> Void)?
  ) {
    self.userdata = userdata
    self.supports_selection_clipboard = supports_selection_clipboard
    self.wakeup_cb = wakeup_cb
    self.action_cb = action_cb
    self.read_clipboard_cb = read_clipboard_cb
    self.confirm_read_clipboard_cb = confirm_read_clipboard_cb
    self.write_clipboard_cb = write_clipboard_cb
    self.close_surface_cb = close_surface_cb
  }
}

public struct GhosttyPlatformIOS {
  public var uiview: UnsafeMutableRawPointer?
  public init(uiview: UnsafeMutableRawPointer? = nil) { self.uiview = uiview }
}

public struct GhosttyPlatformUnion {
  public var ios = GhosttyPlatformIOS()
  public init() {}
}

public struct ghostty_surface_config_s {
  public var platform_tag: GhosttyPlatform = .macos
  public var platform = GhosttyPlatformUnion()
  public var userdata: UnsafeMutableRawPointer?
  public var scale_factor: Double = 1
  public var font_size: Float = 12
  public var context: GhosttySurfaceContext = .window
  public var use_custom_io = false

  public init() {}
}

public struct GhosttySurfaceSize {
  public var columns: UInt32
  public var rows: UInt32
  public init(columns: UInt32, rows: UInt32) {
    self.columns = columns
    self.rows = rows
  }
}

public struct ghostty_color_scheme_e: Equatable, Sendable {
  public let rawValue: UInt32
  public init(rawValue: UInt32) { self.rawValue = rawValue }
  public static let light = ghostty_color_scheme_e(rawValue: 0)
  public static let dark = ghostty_color_scheme_e(rawValue: 1)
}

public let GHOSTTY_COLOR_SCHEME_LIGHT = ghostty_color_scheme_e.light
public let GHOSTTY_COLOR_SCHEME_DARK = ghostty_color_scheme_e.dark

public enum ghostty_result_t: Int32, Equatable, Sendable {
  case SUCCESS = 0
  case ERR_TOO_MANY_ARGS = 1
  case ERR_INVALID_CONFIG = 2
  case ERR_OUT_OF_MEMORY = 3
  case ERR_UNSUPPORTED = 4
}

public let GHOSTTY_SUCCESS = ghostty_result_t.SUCCESS

/// Global library init. The engine may veto initialization (no engine on the
/// host build), which the vendored view treats as "surface creation failed".
public func ghostty_init(
  _ flags: UInt32, _ userdata: UnsafeMutableRawPointer?
) -> ghostty_result_t {
  guard let engine = Ghostty.engine, engine.ensureInitialized() else {
    return .ERR_UNSUPPORTED
  }
  return .SUCCESS
}

// MARK: - Engine

/// The seam between the surface API and a concrete terminal implementation.
/// OpenHarmony installs the libghostty-vt engine; tests install fakes.
public protocol GhosttyEngine: AnyObject {
  func ensureInitialized() -> Bool
  func configNew() -> ghostty_config_t?
  func configLoadFile(_ config: ghostty_config_t, path: UnsafePointer<CChar>)
  func configFinalize(_ config: ghostty_config_t)
  func configFree(_ config: ghostty_config_t)
  func appNew(_ runtimeConfig: ghostty_runtime_config_s, _ config: ghostty_config_t) -> ghostty_app_t?
  func appFree(_ app: ghostty_app_t)
  func appSetColorScheme(_ app: ghostty_app_t, _ scheme: ghostty_color_scheme_e)
  func appKeyboardChanged(_ app: ghostty_app_t)
  func surfaceNew(_ app: ghostty_app_t, _ config: ghostty_surface_config_s) -> ghostty_surface_t?
  func surfaceFree(_ surface: ghostty_surface_t)
  func surfaceSetColorScheme(_ surface: ghostty_surface_t, _ scheme: ghostty_color_scheme_e)
  func surfaceSetContentScale(_ surface: ghostty_surface_t, _ x: Double, _ y: Double)
  func surfaceSetSize(_ surface: ghostty_surface_t, _ width: UInt32, _ height: UInt32)
  func surfaceSetOcclusion(_ surface: ghostty_surface_t, _ occluded: Bool)
  func surfaceSetWriteCallback(
    _ surface: ghostty_surface_t,
    _ callback: ((UnsafeMutableRawPointer?, UnsafePointer<UInt8>?, Int) -> Void)?,
    _ userdata: UnsafeMutableRawPointer?)
  func surfaceFeedData(_ surface: ghostty_surface_t, _ data: UnsafePointer<UInt8>, _ length: Int)
  func surfaceMousePos(_ surface: ghostty_surface_t, _ x: Double, _ y: Double, _ mods: GhosttyMods)
  func surfaceMouseScroll(_ surface: ghostty_surface_t, _ x: Int32, _ y: Double, _ mods: Int32)
  func surfaceRefresh(_ surface: ghostty_surface_t)
  func surfaceDraw(_ surface: ghostty_surface_t)
  func surfaceSize(_ surface: ghostty_surface_t) -> GhosttySurfaceSize
}

// MARK: - Global API (engine-backed)

public enum Ghostty {
  public static weak var engine: GhosttyEngine?

  /// Diagnostics: whether a terminal engine is installed on this build.
  public static var isAvailable: Bool { engine != nil }
}

public func ghostty_config_new() -> ghostty_config_t? { Ghostty.engine?.configNew() }
public func ghostty_config_load_file(_ config: ghostty_config_t, _ path: UnsafePointer<CChar>) {
  Ghostty.engine?.configLoadFile(config, path: path)
}
public func ghostty_config_finalize(_ config: ghostty_config_t) { Ghostty.engine?.configFinalize(config) }
public func ghostty_config_free(_ config: ghostty_config_t) { Ghostty.engine?.configFree(config) }

public func ghostty_app_new(
  _ runtimeConfig: UnsafePointer<ghostty_runtime_config_s>, _ config: ghostty_config_t
) -> ghostty_app_t? {
  Ghostty.engine?.appNew(runtimeConfig.pointee, config)
}
public func ghostty_app_free(_ app: ghostty_app_t) { Ghostty.engine?.appFree(app) }
public func ghostty_app_set_color_scheme(_ app: ghostty_app_t, _ scheme: ghostty_color_scheme_e) {
  Ghostty.engine?.appSetColorScheme(app, scheme)
}
public func ghostty_app_keyboard_changed(_ app: ghostty_app_t) { Ghostty.engine?.appKeyboardChanged(app) }

public func ghostty_surface_config_new() -> ghostty_surface_config_s { ghostty_surface_config_s() }

public func ghostty_surface_new(
  _ app: ghostty_app_t, _ config: UnsafeMutablePointer<ghostty_surface_config_s>
) -> ghostty_surface_t? {
  Ghostty.engine?.surfaceNew(app, config.pointee)
}
public func ghostty_surface_free(_ surface: ghostty_surface_t) { Ghostty.engine?.surfaceFree(surface) }
public func ghostty_surface_set_color_scheme(_ surface: ghostty_surface_t, _ scheme: ghostty_color_scheme_e) {
  Ghostty.engine?.surfaceSetColorScheme(surface, scheme)
}
public func ghostty_surface_set_write_callback(
  _ surface: ghostty_surface_t,
  _ callback: ((UnsafeMutableRawPointer?, UnsafePointer<UInt8>?, Int) -> Void)?,
  _ userdata: UnsafeMutableRawPointer?
) {
  Ghostty.engine?.surfaceSetWriteCallback(surface, callback, userdata)
}
public func ghostty_surface_feed_data(_ surface: ghostty_surface_t, _ data: UnsafePointer<UInt8>, _ len: Int) {
  Ghostty.engine?.surfaceFeedData(surface, data, len)
}
public func ghostty_surface_set_content_scale(_ surface: ghostty_surface_t, _ x: Double, _ y: Double) {
  Ghostty.engine?.surfaceSetContentScale(surface, x, y)
}
public func ghostty_surface_set_size(_ surface: ghostty_surface_t, _ width: UInt32, _ height: UInt32) {
  Ghostty.engine?.surfaceSetSize(surface, width, height)
}
public func ghostty_surface_set_occlusion(_ surface: ghostty_surface_t, _ occluded: Bool) {
  Ghostty.engine?.surfaceSetOcclusion(surface, occluded)
}
public func ghostty_surface_mouse_pos(
  _ surface: ghostty_surface_t, _ x: Double, _ y: Double, _ mods: GhosttyMods
) {
  Ghostty.engine?.surfaceMousePos(surface, x, y, mods)
}
public func ghostty_surface_mouse_scroll(
  _ surface: ghostty_surface_t, _ x: Int32, _ y: Double, _ mods: Int32
) {
  Ghostty.engine?.surfaceMouseScroll(surface, x, y, mods)
}
public func ghostty_surface_refresh(_ surface: ghostty_surface_t) { Ghostty.engine?.surfaceRefresh(surface) }
public func ghostty_surface_draw(_ surface: ghostty_surface_t) { Ghostty.engine?.surfaceDraw(surface) }
public func ghostty_surface_size(_ surface: ghostty_surface_t) -> GhosttySurfaceSize {
  Ghostty.engine?.surfaceSize(surface) ?? GhosttySurfaceSize(columns: 0, rows: 0)
}
