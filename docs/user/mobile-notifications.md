# Mobile notifications

Sign in to T3 Connect, link your environments, and enable **Device Notifications** in **Settings → Notifications** to receive alerts when an agent finishes, fails, needs approval, or asks for input. Tap a notification to open its thread. Your environment must have agent activity publishing enabled.

Enable **Ongoing Agent Activity** on Android or **Live Activity Updates** on iOS to follow work without opening the app. Finished results remain visible for up to 15 minutes. You can dismiss an Android activity card without disabling alerts; turn off ongoing activity in Settings to stop future cards.

Ordinary alerts stay quiet while the mobile app is in the foreground. Ongoing activity continues to update. Viewing a thread on another device does not silence your phone's alerts.

Android notifications require Android 7.0 or newer and Google Play services. Android 16 and newer can promote ongoing activity to a Live Update, subject to system settings and device support. Other devices show a regular ongoing notification. Android 7's battery-saving modes can delay removal of expired cards.

Notification permission and Android notification channels are controlled in system Settings. System push delivery requires T3 Connect; a direct or Tailscale connection alone does not enable push notifications. The mobile app does not need to maintain a connection to your environment. Force-stopping the Android app in system Settings prevents push delivery until you open it again.

## Android private connections

On Android builds with embedded Tailscale, open **Settings → Environments → App 内 Tailscale**, enable **连接 tailnet**, and sign in. Pair the environment using its Tailscale address. This connection belongs to T3 and does not request Android's system VPN slot. Another VPN can still restrict the app's internet access.

For direct connections without system push, manually enable **后台连接** in the same section and grant notification permission. A silent ongoing notification keeps the connection service visible; its stop action turns the mode off. The app alerts on new requests for confirmation, completed tasks, and failed tasks while it is in the background. Repeated updates replace the same thread's notification, and opening the app does not replay old history as alerts.

Background connection uses more power than system push. Android deep sleep, loss of connectivity, process termination, or force-stop can delay or prevent delivery. Reopen the app to reconnect. Turning this mode off preserves saved environment connections and the Tailscale login.
