import { Plugin, Segment } from "../utils/host.js";
import {
  isGroupChat,
  checkSubscribePermission,
  checkUnsubscribePermission,
} from "../utils/permission.js";
import { guardPluginHandler } from "../utils/host.js";
import { extractParamFromMsg, formatFansCount } from "../utils/format.js";
import subscriptionManager from "../models/subscription.manager.js";
import historyManager from "../models/history.manager.js";
import bilibiliAPI from "../models/bilibili.api.js";
import config from "../utils/config.js";
import { resolveTarget } from "../utils/targetResolver.js";

class SubscribeApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝(?:订阅|关注|监控)|(?:订阅|关注|监控)\\s*(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝)\\s+\\S+$",
        fnc: "subscribe",
        permission: "all",
      },
      {
        reg: "^#(?:取消(?:粉丝)?(?:订阅|关注|监控)|退订\\s*(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝)\\s+\\S+$",
        fnc: "unsubscribe",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-Subscribe",
      dsc: "B站粉丝数订阅管理",
      rule: rules,
    });
  }

  async subscribe() {
    return guardPluginHandler(this, this._subscribe);
  }

  async _subscribe() {
    if (!isGroupChat(this.e)) {
      await this.reply("🌸 仅支持群聊使用此命令哦~");
      return;
    }

    const perm = checkSubscribePermission(this.e);
    if (!perm.allowed) {
      await this.reply("🔒 " + perm.reason);
      return;
    }

    const resolved = await resolveTarget(extractParamFromMsg(this.e.msg), String(this.e.group_id));
    if (resolved.error) {
      await this.reply(resolved.error);
      return;
    }

    const uid = resolved.uid;
    const groupId = String(this.e.group_id);

    if (subscriptionManager.isSubscribed(groupId, uid)) {
      const sub = subscriptionManager.getSubscription(groupId, uid);
      const name = sub?.nickname || "UP主" + uid;
      await this.reply("📌 " + name + " (UID:" + uid + ") 已经订阅过了哦~");
      return;
    }

    if (subscriptionManager.isAtLimit(groupId)) {
      const max = config.get("maxSubscriptionsPerGroup", 100);
      await this.reply("📋 本群订阅已达上限 (" + max + "个)，请先取消一些再试~");
      return;
    }

    let nickname = "";
    let fansCount = 0;

    try {
      const result = await bilibiliAPI.getFansCountAndNickname(uid);
      nickname = result.nickname;
      fansCount = result.follower;
    } catch (err) {
      if (err.message === "UID不存在") {
        await this.reply("🔍 该UID不存在，请检查后重试~");
        return;
      }
      await this.reply("🌐 网络不太稳定，请稍后再试~");
      return;
    }

    subscriptionManager.subscribe(groupId, uid, nickname, fansCount);
    historyManager.addRecord(uid, fansCount, "manual");

    const displayName = nickname || "UP主" + uid;
    await this.reply(
      "📈 已订阅 " + displayName + "\n" +
      "UID: " + uid + "\n" +
      "当前粉丝数: " + formatFansCount(fansCount)
    )
  }

  async unsubscribe() {
    return guardPluginHandler(this, this._unsubscribe);
  }

  async _unsubscribe() {
    if (!isGroupChat(this.e)) {
      await this.reply("🌸 仅支持群聊使用此命令哦~");
      return;
    }

    const perm = checkUnsubscribePermission(this.e);
    if (!perm.allowed) {
      await this.reply("🔒 " + perm.reason);
      return;
    }

    const resolved = await resolveTarget(extractParamFromMsg(this.e.msg), String(this.e.group_id));
    if (resolved.error) {
      await this.reply(resolved.error);
      return;
    }

    const uid = resolved.uid;
    const groupId = String(this.e.group_id);

    if (!subscriptionManager.isSubscribed(groupId, uid)) {
      await this.reply("📭 UID:" + uid + " 尚未在本群订阅~");
      return;
    }

    const sub = subscriptionManager.getSubscription(groupId, uid);
    const displayName = sub?.nickname || "UP主" + uid;

    subscriptionManager.unsubscribe(groupId, uid);

    await this.reply("✅ 已取消订阅 " + displayName + " (UID:" + uid + ")");
  }
}

export { SubscribeApp as default };
