import { Plugin, Segment } from "../utils/host.js";
import { isGroupChat } from "../utils/permission.js";
import { guardPluginHandler } from "../utils/host.js";
import { extractParamFromMsg, formatFansCount, formatChange, formatChangeDirection } from "../utils/format.js";
import subscriptionManager from "../models/subscription.manager.js";
import historyManager from "../models/history.manager.js";
import bilibiliAPI from "../models/bilibili.api.js";
import chartRenderer from "../models/chart.renderer.js";
import config from "../utils/config.js";
import { resolveTarget } from "../utils/targetResolver.js";

class QueryApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:查|查询|看|看看|看下)?\\s*(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝数?\\s+\\S+$",
        fnc: "query",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-Query",
      dsc: "B站粉丝数查询",
      rule: rules,
    });
  }

  async query() {
    return guardPluginHandler(this, this._query);
  }

  async _query() {
    if (!isGroupChat(this.e)) {
      await this.reply("🌸 仅支持群聊使用此命令哦~");
      return;
    }

    const resolved = await resolveTarget(extractParamFromMsg(this.e.msg), String(this.e.group_id));
    if (resolved.error) {
      await this.reply(resolved.error);
      return;
    }

    const uid = resolved.uid;

    let nickname = "";
    let fansCount = 0;
    let face = '';
    let sign = '';
    try {
      const result = await bilibiliAPI.getFansCountAndNickname(uid);
      nickname = result.nickname;
      fansCount = result.follower;
      face = result.face || '';
      sign = result.sign || '';
    } catch (err) {
      if (err.message === "UID不存在") {
        await this.reply("🔍 该UID不存在，请检查后重试~");
        return;
      }
      await this.reply("🌐 网络不太稳定，请稍后再试~");
      return;
    }

    const groupId = String(this.e.group_id);
    const isSubbed = subscriptionManager.isSubscribed(groupId, uid);

    const displayName = nickname || "UP主" + uid;
    const textMsg =
      "📊 " + displayName + "\n" +
      "UID: " + uid + "\n" +
      "当前粉丝数: " + formatFansCount(fansCount);

    if (!isSubbed) {
      await this.reply(textMsg + "\n\n💡 提示: 该UP主尚未在本群订阅，无法显示历史曲线~");
      return;
    }

    historyManager.addRecord(uid, fansCount, "query");

    const rangeDays = config.get("defaultChartRange", 30);
    const records = historyManager.getRecords(uid, rangeDays);

    if (records.length < 2) {
      await this.reply(
        textMsg + "\n\n📭 历史数据不足\n" +
        "至少需要2个数据点才能生成趋势图\n" +
        "当前记录数: " + records.length
      );
      return;
    }

    let chartBuffer = null;
    try {
      chartBuffer = await chartRenderer.renderFansChart(uid, displayName, records, rangeDays, face, sign, '');
    } catch (err) {
      if (typeof logger !== "undefined" && logger.error) {
        logger.error("[BilibiliFansTracker] 图表渲染失败: " + err.message);
      }
    }

    if (chartBuffer) {
      const base64 = chartBuffer.toString("base64");
      const imgSegment = Segment.image("base64://" + base64);
      await this.e.reply([textMsg, imgSegment]);
    } else {
      await this.reply(textMsg + "\n\n⚠️ 图表生成失败，请稍后再试~");
    }
  }
}

export { QueryApp as default };
