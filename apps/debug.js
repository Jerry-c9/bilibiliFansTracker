import { Plugin, guardPluginHandler } from "../utils/host.js";
import config from "../utils/config.js";
import subscriptionManager from "../models/subscription.manager.js";
import { existsSync } from "fs";
import { join } from "path";
import { _paths } from "../utils/paths.js";

class DebugApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#B站调试配置$",
        fnc: "showDebug",
        permission: "master",
      },
    ];

    super({
      name: "BilibiliFansTracker-Debug",
      dsc: "B站粉丝追踪调试",
      rule: rules,
    });
  }

  async showDebug() {
    return guardPluginHandler(this, this._showDebug);
  }

  async _showDebug() {
    const enabled = config.get("enabled", true);
    const updateCron = config.get("updateCron", "0 0 8 * * *");
    const pushCron = config.get("pushCron", "0 5 8 * * *");
    const cleanupCron = config.get("cleanupCron", "0 0 4 * * *");

    const guobaPath = join(_paths.pluginData, "guoba.config.yaml");
    const hasGuoba = existsSync(guobaPath);
    const hasDefault = existsSync(_paths.configFile);

    const uidCount = subscriptionManager.getAllUniqueUids().length;
    const groupCount = subscriptionManager.getAllGroupIds().length;

    const lines = [
      "🔧 B站粉丝追踪 调试信息",
      "",
      "📌 插件状态: " + (enabled ? "✅ 已启用" : "⛔ 已禁用"),
      "",
      "📌 Cron 配置（最终生效值）",
      "  updateCron:  " + updateCron,
      "  pushCron:    " + pushCron,
      "  cleanupCron: " + cleanupCron,
      "",
      "📌 配置来源",
      "  config/default.yaml:     " + (hasDefault ? "✅ 存在" : "❌ 不存在"),
      "  data/guoba.config.yaml:  " + (hasGuoba ? "✅ 存在（优先）" : "❌ 不存在"),
      "",
      "📌 订阅统计",
      "  已订阅UID数: " + uidCount,
      "  已订阅群数:  " + groupCount,
      "",
      "💡 提示: 若 Guoba 修改后 Cron 未生效，请重启 Yunzai",
    ];

    await this.reply(lines.join("\n"));
  }
}

export { DebugApp as default };
