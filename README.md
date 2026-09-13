<div align="center">

# BilibiliFansTracker

适用于 **TRSS-Yunzai** 的 B 站 UP 主粉丝数追踪插件

订阅 UP 主 · 定时采集粉丝数 · 历史曲线 · 变化推送 · 里程碑提醒

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)
![TRSS-Yunzai](https://img.shields.io/badge/TRSS--Yunzai-v3-blueviolet.svg)
![AI Written](https://img.shields.io/badge/AI-100%25%20AI%20Written-orange.svg)
![Maintenance](https://img.shields.io/badge/maintenance-low%20frequency-lightgrey.svg)

</div>

---

## 关于本项目

- **🤖 本插件完全由 AI 编写。** 从代码到文档均由 AI 生成，可能存在未覆盖到的边界情况，
  欢迎自行审阅、修改与二次开发。
- **🛠 更新频率：能运作就不会去更新。** 本项目秉持「能正常跑就不会主动改动」的原则，
  以稳定性优先，更新随缘、按需进行，不承诺持续的版本节奏。

> 使用前请先阅读文末的 [免责声明](#免责声明)。

## 功能

- 订阅 / 取消订阅 B 站 UP 主（支持 UID 或用户名搜索）
- 查看订阅列表
- 查询粉丝数，并绘制历史粉丝曲线
- 独立的粉丝曲线命令（近 7 / 30 / 90 / 180 / 365 天）
- 定时采集粉丝数并写入历史记录
- 定时推送粉丝数变化（较上次、较 7 天前）
- 里程碑提醒（默认 10 / 50 / 100 / 500 / 1000 万）
- UP 主昵称变更提醒
- 粉丝数变化较多时自动使用合并转发，失败时降级为逐条发送
- CSV 历史数据导出（私聊使用）
- 历史数据自动清理与降采样压缩
- Guoba 插件配置面板（可视化 Cron 编辑器）

## 环境要求

| 依赖 | 要求 |
|------|------|
| Node.js | >= 20（已在 Node.js 24 上验证） |
| TRSS-Yunzai | v3（其它 Yunzai 分支未验证） |
| puppeteer | 由宿主提供，用于图表渲染 |
| 消息适配器 | NapCat / OneBot / icqq / QQ 官方 Bot 等均可 |

## 安装

1. 进入 Yunzai 的插件目录并克隆本插件：

   ```bash
   cd TRSS-Yunzai/plugins
   git clone https://github.com/Jerry-c9/bilibiliFansTracker.git bilibiliFansTracker
   ```

2. 安装依赖（在插件目录内执行）：

   ```bash
   cd bilibiliFansTracker
   npm install
   # 或 pnpm install
   ```

3. 图表渲染依赖 `puppeteer`，TRSS-Yunzai 通常已内置，无需重复安装；
   若宿主没有，请自行安装。

4. 重启 Yunzai。插件会自动加载，并生成默认配置 `config/default.yaml`。

## 配置

配置有两个来源，**`data/guoba.config.yaml` 优先级更高**：

| 文件 | 生成方式 | 是否提交到 Git |
|------|----------|----------------|
| `config/default.yaml` | 首次启动自动生成，可手动编辑 | 是（请勿写入敏感信息） |
| `data/guoba.config.yaml` | 通过 Guoba 面板保存时生成 | 否（`.gitignore` 已忽略） |

可配置项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 插件开关，关闭后不再执行定时任务 |
| `maxSubscriptionsPerGroup` | `100` | 每群最大订阅数 |
| `updateCron` | `"0 0 8 * * *"` | 更新任务 Cron（采集粉丝数） |
| `pushCron` | `"0 5 8 * * *"` | 推送任务 Cron |
| `cleanupCron` | `"0 0 4 * * *"` | 清理任务 Cron |
| `historyRetentionDays` | `365` | 历史数据保留天数 |
| `mergeForwardThreshold` | `3` | 本群变化 UP 数超过该值时使用合并转发 |
| `defaultChartRange` | `30` | 默认图表时间范围（7/30/90/180/365） |
| `milestoneEnabled` | `true` | 里程碑提醒开关 |
| `milestones` | `[10, 50, 100, 500, 1000]` | 里程碑阈值（单位：万） |
| `apiTimeout` | `10000` | B 站 API 请求超时（毫秒） |
| `apiRetryCount` | `3` | B 站 API 请求失败重试次数 |
| `userAgent` | 见默认配置 | 请求 B 站 API 使用的 User-Agent |
| `cookie` | `""` | **可选**，B 站 Cookie，留空为匿名请求 |
| `showLastChange` | `true` | 推送中显示较上次变化 |
| `showWeekChange` | `true` | 推送中显示较 7 天前变化 |
| `debug.enabled` | `false` | 调试模式，保留中间产物并输出详细日志 |
| `debugKeepHtml` | `false` | 是否保留图表渲染的临时 HTML |

> Cron 为 6 字段格式：`秒 分 时 日 月 周`（node-schedule 不支持「年」字段）。

### 关于 Cookie

- 留空时使用匿名请求，绝大多数情况下可以正常读取粉丝数。
- 若频繁遇到风控（如 `-412` / `-352`），可填写 Cookie 提升成功率。
- **Cookie 属于敏感凭据，请勿写入 `config/default.yaml`，更不要提交到 Git。**
  推荐通过 Guoba 面板配置，它会写入被忽略的 `data/guoba.config.yaml`。

## 使用方法

命令前缀为 `#`。

| 命令 | 说明 | 权限 | 场景 |
|------|------|------|------|
| `#B站粉丝订阅 <UID/用户名>` | 订阅 UP 主 | 主人 / 群主 / 管理员 | 群聊 |
| `#取消粉丝订阅 <UID/用户名>` | 取消订阅 | 主人 / 群主 / 管理员 | 群聊 |
| `#B站订阅列表` | 查看本群订阅列表 | 所有人 | 群聊 |
| `#查B站粉丝数 <UID/用户名>` | 查询粉丝数及历史曲线 | 所有人 | 群聊 |
| `#B站粉丝曲线 <UID/用户名> [天数]` | 查看粉丝曲线，天数可选 7/30/90/180/365 | 所有人 | 群聊 |
| `#导出B站粉丝历史 <UID/用户名>` | 导出 CSV 历史数据 | 所有人 | 私聊 |
| `#B站粉丝数帮助` | 显示帮助 | 所有人 | 均可 |
| `#B站调试配置` | 查看当前配置与订阅统计 | 主人 | 均可 |

使用示例（`8047632` 为 B 站官方账号「哔哩哔哩弹幕网」的 UID，仅作示例）：

```text
#B站粉丝订阅 8047632        # 订阅
#B站订阅列表                # 查看本群订阅
#查B站粉丝数 8047632        # 查询粉丝数 + 曲线
#B站粉丝曲线 8047632 30     # 近 30 天曲线
#取消粉丝订阅 8047632       # 取消订阅
```

说明：

- `<UID/用户名>` 支持纯数字 UID，也支持昵称：昵称会先在本群订阅中匹配，匹配不到再调用 B 站搜索。
- `#B站粉丝订阅` 也接受 `#订阅粉丝`、`#关注B站粉丝` 等写法；
  取消订阅也接受 `#取消订阅`、`#退订B站粉丝`、`#退订粉丝`。**注意 `#B站粉丝取消订阅` 不是有效命令。**
- 查询曲线要求该 UP 主**已在本群订阅**，否则只会返回当前粉丝数。
- 导出命令建议私聊执行，群聊中会提示改为私聊。
- 插件数据按群隔离，群号仅作为存储键（例如 `123456`），不会出现在聊天消息中。

## 自动推送

- **采集**：由 `updateCron` 控制（默认每天 08:00）。任务遍历所有已订阅 UID，
  逐个请求粉丝数并写入历史记录，请求之间带随机延迟以降低风控概率。
- **推送**：由 `pushCron` 控制（默认每天 08:05）。仅当粉丝数与上次记录**发生变化**时推送，
  内容包含当前粉丝数、较上次变化、较 7 天前变化，可选附带趋势图。
- **里程碑**：采集阶段检测到跨越阈值时立即推送一次，同一里程碑不会重复推送。
- **昵称变更**：检测到 UP 主昵称变化时推送提醒。
- **修改频率**：修改 `updateCron` / `pushCron`（或通过 Guoba 可视化编辑器）后**需要重启 Yunzai** 生效。

## 数据存储

所有数据以 JSON 文件保存在插件的 `data/` 目录下，不依赖数据库或 Redis，重启后自动保留：

| 路径 | 说明 |
|------|------|
| `data/subscriptions.json` | 订阅数据，按群隔离 |
| `data/history/<uid>.json` | 每个 UP 主的历史粉丝数 |
| `data/cache/user/<uid>.json` | UP 主信息缓存（昵称 / 头像 / 签名） |
| `data/cache/avatar/<uid>.jpg` | 头像文件缓存 |
| `data/exports/` | CSV 导出目录 |
| `data/guoba.config.yaml` | Guoba 面板保存的配置 |
| `data/temp/` | 图表渲染临时文件 |

`data/` 已被 `.gitignore` 忽略，**不会**随仓库发布。写入采用「先写临时文件再重命名」的原子方式；
若数据文件损坏，会被隔离为 `*.corrupt-<时间戳>` 而不是静默丢弃。

## 常见问题

| 问题 | 排查方向 |
|------|----------|
| B 站 API 请求失败 / 超时 | 检查能否访问 `api.bilibili.com`；调大 `apiTimeout` 与 `apiRetryCount` |
| Cookie 失效 | 重新获取并更新 Cookie，或临时清空改用匿名请求 |
| 提示 UP 主不存在 | 确认 UID 是否正确；昵称搜索受限时请改用数字 UID |
| 定时任务不执行 | 确认 `enabled: true` 且 Cron 为 6 字段合法格式，修改后重启 Yunzai（`#B站调试配置` 可看生效值） |
| 消息无法发送 | 确认机器人在群内且未被禁言；合并转发失败会自动降级逐条发送 |
| 数据异常 / 文件损坏 | 插件会隔离为 `*.corrupt-*` 并重新初始化，可手动检查被隔离的文件 |
| 图表生成失败 | 多为 `puppeteer` 未安装或无法启动 Chromium |
| 时区不对 | 定时触发与历史时间均使用**服务器本地时区**，请确认服务器时区设置 |
| 重复执行定时任务 | 通过**重启 Yunzai**（而非仅重载插件）加载改动，避免同一进程内重复注册 |

## 项目结构

```text
bilibiliFansTracker/
├── index.js                 # 插件入口
├── guoba.support.js         # Guoba 配置面板
├── apps/                    # 命令处理
│   ├── subscribe.js         # 订阅 / 取消订阅
│   ├── list.js              # 订阅列表
│   ├── query.js             # 查询粉丝数 + 曲线
│   ├── chart.js             # 独立曲线图
│   ├── export.js            # CSV 导出
│   ├── help.js              # 帮助
│   └── debug.js             # 调试信息
├── models/                  # 业务逻辑
│   ├── bilibili.api.js      # B 站 API 封装
│   ├── subscription.manager.js
│   ├── history.manager.js
│   ├── chart.renderer.js
│   ├── csv.exporter.js
│   ├── push.manager.js
│   └── scheduler.js
├── utils/                   # 工具（路径、配置、权限、格式化、持久化等）
├── config/default.yaml      # 默认配置
├── resources/               # 图表模板
├── test/                    # 内置测试（node --test）
├── data/                    # 运行时数据（自动创建，已被忽略）
├── .gitignore
├── LICENSE
└── README.md
```

## 测试

```bash
npm test
```

使用 Node.js 内置测试运行器，覆盖纯工具函数（格式化、Cron 构建、降采样、权限判定）
以及各命令的正则路由。测试**不会访问 B 站网络**。

## 相关链接 / 致谢

- 运行框架：[TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)
- 配置面板：[Guoba Plugin](https://github.com/guoba-yunzai/guoba-plugin)
- 图表渲染：[Apache ECharts](https://echarts.apache.org/)
- 定时任务：[node-schedule](https://github.com/node-schedule/node-schedule)

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

## 免责声明

本项目仅供学习与个人使用。使用 B 站接口时请遵守哔哩哔哩相关服务条款与接口使用规范，
避免高频请求或其他可能影响服务稳定性的行为。因使用本项目产生的任何后果由使用者自行承担。
