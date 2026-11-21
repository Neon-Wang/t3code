# 待办推送中转

这个无状态 Worker 接收 T3 服务端的待办消息，转发到 FCM 或 OPPO。设备 token 保存在 T3 服务端。手机通过已有的 T3 连接登记，无需保存 Worker 密钥。

## 准备和部署

在这个目录运行以下命令。命令会写入 Cloudflare 并部署 Worker，需由部署者自行执行。

```sh
npx wrangler secret put RELAY_SECRET
npx wrangler secret put FCM_SERVICE_ACCOUNT
npx wrangler secret put OPPO_APP_KEY
npx wrangler secret put OPPO_MASTER_SECRET
npx wrangler deploy
```

- `RELAY_SECRET`：随机生成的共享密钥，与 T3 设置里的“待办推送”密钥一致。
- `FCM_SERVICE_ACCOUNT`：Firebase 项目的完整服务账号 JSON，包含 `project_id`、`client_email` 和 `private_key`。
- `OPPO_APP_KEY` 和 `OPPO_MASTER_SECRET`：OPPO 推送平台的服务端凭据。客户端注册使用的 AppSecret 单独留在安卓打包配置中。

只启用一个渠道时，可以先省略另一个渠道的凭据。设置中的 Worker 地址填写部署后的 HTTPS origin，例如 `https://your-worker.workers.dev`。

## 自测

下面的请求会向真实设备发送通知。部署后，将变量设为自己的值，再执行；密钥和设备 token 不要写入仓库。

```sh
curl --fail-with-body "$RELAY_URL/send" \
  -H "Authorization: Bearer $RELAY_SECRET" \
  -H 'Content-Type: application/json' \
  --data @- <<EOF_REQUEST
{
  "targets": [{
    "provider": "fcm",
    "token": "$DEVICE_TOKEN",
    "url": "$APP_SCHEME://threads/$ENVIRONMENT_ID/$THREAD_ID"
  }],
  "message": {
    "title": "待办 · agent",
    "body": "请确认下一步操作。",
    "environmentId": "$ENVIRONMENT_ID",
    "threadId": "$THREAD_ID",
    "collapseKey": "manual-check:new",
    "urgent": false
  }
}
EOF_REQUEST
```

OPPO 自测将 `provider` 改为 `oppo`，token 使用其 registerId。`url` 必须采用实际安装的 App scheme。

响应的 `results` 按 `index` 对应请求目标，包含 `ok`、`invalidToken` 和 `code`。FCM 的 `UNREGISTERED`、`NOT_FOUND` 会标记失效；OPPO 错误仅返回错误码，保留登记。服务端据此记录 warning 或移除失效 FCM token。

正文由 Worker 按渠道截断：FCM 最多 500 字；OPPO 标准样式最多 200 字、标题最多 50 字，超长部分以“…”结尾。点通知后查看完整问题。

OPPO 使用[消息体定义](https://open.oppomobile.com/wiki/doc#id=11236)的下划线字段。官方[单推示例](https://open.oppomobile.com/wiki/doc#id=11238)存在字段拼写和错误码歧义，需在真机联调确认 `app_message_id`、`click_action_type`、`click_action_url`、`notify_id`。新问题和升紧急使用不同消息 ID，通知栏覆盖 ID 保持相同。
