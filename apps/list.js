import { Plugin, guardPluginHandler } from "../utils/host.js";
import { isGroupChat } from "../utils/permission.js";
import { formatFansCount } from "../utils/format.js";
import subscriptionManager from "../models/subscription.manager.js";
import config from "../utils/config.js";

const MAX_LIST_ITEMS = 30;

class ListApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*订阅列表$",
        fnc: "showList",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-List",
      dsc: "B站粉丝订阅列表",
      rule: rules,
    });
  }

  async showList() {
    return guardPluginHandler(this, this._showList);
  }

  async _showList() {
    if (!isGroupChat(this.e)) {
      await this.reply("🌸 仅支持群聊使用此命令哦~");
      return;
    }

    const groupId = String(this.e.group_id);
    const subs = subscriptionManager.getGroupSubscriptions(groupId);

    if (subs.length === 0) {
      await this.reply(
        "📭 本群还没有订阅任何UP主~\n" +
        "发送 #B站粉丝订阅 [UID/用户名] 添加订阅"
      );
      return;
    }

    // 最近订阅的排在前面
    subs.sort((a, b) => (b.subscribedAt || 0) - (a.subscribedAt || 0));

    const max = config.get("maxSubscriptionsPerGroup", 100);
    const lines = ["📋 本群订阅列表 (" + subs.length + "/" + max + ")", ""];

    const shown = subs.slice(0, MAX_LIST_ITEMS);
    for (let i = 0; i < shown.length; i++) {
      const sub = shown[i];
      const name = sub.nickname || "UP主" + sub.uid;
      lines.push((i + 1) + ". " + name);
      lines.push("   UID:" + sub.uid + " | 粉丝:" + formatFansCount(sub.lastFansCount));
    }

    if (subs.length > shown.length) {
      lines.push("");
      lines.push("... 还有 " + (subs.length - shown.length) + " 个未显示");
    }

    lines.push("");
    lines.push("💡 取消订阅: #取消粉丝订阅 [UID/用户名]");

    await this.reply(lines.join("\n"));
  }
}

export { ListApp as default };
