import { requireOptionalNativeModule } from "expo";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Alert, Modal, Platform, View, findNodeHandle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { AppText } from "../../components/ui/AppText";
import { Button as MaterialButton } from "../../components/ui/Button";
import { LoadingStrip } from "../../components/ui/LoadingStrip";
import { useI18n } from "../../i18n/useI18n";
import { downloadBrowserFile, downloadFileName } from "../../lib/attachmentDownload";
import {
  browserDownloadName,
  registerInAppBrowser,
  type BrowserRequest,
} from "../../lib/inAppBrowser";
import { routeTailnetUrl } from "../tailnet/native";

interface BrowserDownload {
  readonly viewTag: number;
  readonly url: string;
  readonly userAgent?: string;
  readonly contentDisposition?: string;
  readonly mimeType?: string;
}
interface NativeDownloads {
  captureBrowserDownloads(viewTag: number): Promise<void>;
  saveBrowserDownload(uri: string, name: string, mimeType: string): Promise<string>;
  addListener(
    event: "onBrowserDownload",
    listener: (event: BrowserDownload) => void,
  ): { remove(): void };
}
const nativeDownloads =
  Platform.OS === "android"
    ? requireOptionalNativeModule<NativeDownloads>("T3NativeControls")
    : null;

export function InAppBrowserHost() {
  const [request, setRequest] = useState<BrowserRequest | null>(null);
  useEffect(() => registerInAppBrowser(setRequest), []);
  return request ? (
    <BrowserPage key={request.url} initialUrl={request.url} onClose={() => setRequest(null)} />
  ) : null;
}

function BrowserPage({
  initialUrl,
  onClose,
}: {
  readonly initialUrl: string;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const webView = useRef<WebView<object>>(null);
  const container = useRef<ComponentRef<typeof View>>(null);
  const viewTag = useRef<number | null>(null);
  const attaching = useRef(false);
  const alive = useRef(true);
  const download = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(Platform.OS !== "android");
  const [displayHost, setDisplayHost] = useState(new URL(initialUrl).host);
  const [initialRoute] = useState(() => routeTailnetUrl(initialUrl));
  const displayOrigins = useRef(
    new Map([[new URL(initialRoute).origin, new URL(initialUrl).host]]),
  );
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const receiveDownload = useCallback(
    async (event: BrowserDownload) => {
      if (download.current) return;
      if (!/^https?:\/\//i.test(event.url)) {
        setError(t("mobile.browser.unsupportedDownload"));
        return;
      }
      const controller = new AbortController();
      download.current = controller;
      const name = downloadFileName(browserDownloadName(event.url, event.contentDisposition));
      const mimeType = event.mimeType || "application/octet-stream";
      setDownloading(name);
      setSaved(null);
      setError(null);
      try {
        const file = await downloadBrowserFile({
          url: event.url,
          userAgent: event.userAgent,
          attachment: { name, mimeType },
          signal: controller.signal,
        });
        if (!file) return;
        try {
          if (controller.signal.aborted) return;
          if (nativeDownloads && Number(Platform.Version) >= 29) {
            savingRef.current = true;
            setSaving(true);
            await nativeDownloads.saveBrowserDownload(file.uri, name, mimeType);
            if (alive.current) setSaved(t("mobile.browser.saved", { name }));
          } else {
            await file.share(controller.signal);
          }
        } finally {
          file.dispose();
        }
      } catch {
        if (alive.current && !controller.signal.aborted)
          setError(t("mobile.browser.downloadFailed"));
      } finally {
        savingRef.current = false;
        if (alive.current) setSaving(false);
        if (download.current === controller) download.current = null;
        if (alive.current) setDownloading(null);
      }
    },
    [t, setError, setSaved],
  );
  useEffect(() => {
    const subscription = nativeDownloads?.addListener("onBrowserDownload", (event) => {
      if (event.viewTag === viewTag.current) void receiveDownload(event);
    });
    return () => subscription?.remove();
  }, [receiveDownload]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      download.current?.abort();
    };
  }, []);

  const attachDownloads = async () => {
    if (ready || attaching.current || !nativeDownloads) return;
    const tag = findNodeHandle(container.current);
    if (tag == null) return;
    attaching.current = true;
    viewTag.current = tag;
    try {
      await nativeDownloads.captureBrowserDownloads(tag);
      if (alive.current) {
        setReady(true);
        setError(null);
      }
    } catch {
      if (alive.current) setError(t("mobile.browser.openFailed"));
    } finally {
      attaching.current = false;
    }
  };
  const navigate = (target: string) => {
    if (!/^https?:\/\//i.test(target)) {
      Alert.alert(t("mobile.browser.title"), t("mobile.browser.unsupportedLink"));
      return;
    }
    setError(null);
    const routed = routeTailnetUrl(target);
    if (routed !== target) displayOrigins.current.set(new URL(routed).origin, new URL(target).host);
    // Keep the WebView's own back stack; setting source to a previously used
    // URL is otherwise a no-op after goBack(). The destination is a quoted URL.
    webView.current?.injectJavaScript(`window.location.assign(${JSON.stringify(routed)});true;`);
  };
  const routedUrl = ready ? initialRoute : "about:blank";
  const close = () => {
    if (!savingRef.current) onClose();
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (savingRef.current) return;
        if (canGoBack) webView.current?.goBack();
        else close();
      }}
    >
      <View className="flex-1 bg-background">
        <SafeAreaView style={{ flex: 1 }}>
          <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
            <MaterialButton
              label={t("action.back")}
              tone="text"
              disabled={!canGoBack}
              onPress={() => webView.current?.goBack()}
            />
            <View className="min-w-0 flex-1">
              <AppText numberOfLines={1} className="font-t3-semibold text-foreground">
                {title || t("mobile.browser.title")}
              </AppText>
              <AppText numberOfLines={1} className="text-xs text-foreground-muted">
                {displayHost}
              </AppText>
            </View>
            <MaterialButton
              label={t("action.close")}
              tone="text"
              disabled={saving}
              onPress={close}
            />
          </View>
          {progress > 0 && progress < 1 ? <LoadingStrip progress={progress} /> : null}
          {error ? (
            <View className="gap-2 p-3">
              <AppText>{error}</AppText>
              <MaterialButton
                label={t("action.retry")}
                onPress={() => {
                  setError(null);
                  if (ready) webView.current?.reload();
                  else void attachDownloads();
                }}
              />
            </View>
          ) : null}
          {downloading ? (
            <View className="flex-row items-center gap-2 p-3">
              <AppText className="flex-1">
                {t(saving ? "mobile.browser.saving" : "mobile.browser.downloading", {
                  name: downloading,
                })}
              </AppText>
              <MaterialButton
                label={t("action.cancel")}
                tone="text"
                disabled={saving}
                onPress={() => {
                  if (!savingRef.current) download.current?.abort();
                }}
              />
            </View>
          ) : null}
          {saved ? <AppText className="p-3">{saved}</AppText> : null}
          <View
            ref={container}
            collapsable={false}
            className="flex-1"
            onLayout={() => void attachDownloads()}
          >
            <WebView<object>
              ref={webView}
              source={{ uri: routedUrl }}
              originWhitelist={["*"]}
              sharedCookiesEnabled
              setSupportMultipleWindows
              javaScriptCanOpenWindowsAutomatically={false}
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              onShouldStartLoadWithRequest={(request) => {
                if (request.url === "about:blank" || request.isTopFrame === false) return true;
                if (!/^https?:\/\//i.test(request.url)) return false;
                const routed = routeTailnetUrl(request.url);
                if (routed !== request.url) {
                  navigate(request.url);
                  return false;
                }
                return true;
              }}
              onOpenWindow={(event) => navigate(event.nativeEvent.targetUrl)}
              onFileDownload={(event) =>
                void receiveDownload({ viewTag: 0, url: event.nativeEvent.downloadUrl })
              }
              onNavigationStateChange={(state) => {
                if (/^https?:\/\//i.test(state.url)) {
                  const actual = new URL(state.url);
                  setDisplayHost(displayOrigins.current.get(actual.origin) ?? actual.host);
                }
                setCanGoBack(state.canGoBack);
                setTitle(state.title || "");
              }}
              onLoadProgress={(event) => setProgress(event.nativeEvent.progress)}
              onLoadStart={() => {
                setError(null);
                setSaved(null);
              }}
              onError={() => {
                setProgress(0);
                setError(t("mobile.browser.loadFailed"));
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.statusCode >= 400)
                  setError(t("mobile.browser.httpError", { status: event.nativeEvent.statusCode }));
              }}
              style={{ flex: 1, backgroundColor: "transparent" }}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
