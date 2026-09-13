import { Plugin, Segment } from "../utils/host.js";
import { isGroupChat } from "../utils/permission.js";
import { guardPluginHandler } from "../utils/host.js";
import { extractParamFromMsg, formatFansCount } from "../utils/format.js";
import historyManager from "../models/history.manager.js";
import chartRenderer from "../models/chart.renderer.js";
import bilibiliAPI from "../models/bilibili.api.js";
import config from "../utils/config.js";
import { resolveTarget } from "../utils/targetResolver.js";

class ChartApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝(?:曲线|走势|图表|历史曲线)\\s+\\S+(?:\\s+\\d+)?$",
        fnc: "showChart",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-Chart",
      dsc: "B站粉丝曲线图",
      rule: rules,
    });
  }

  async showChart() {
    return guardPluginHandler(this, this._showChart);
  }

  async _showChart() {
    if (!isGroupChat(this.e)) {
      await this.reply("🌸 仅支持群聊使用此命令哦~");
      return;
    }

    const msg = String(this.e.msg || "");
    const parts = msg.trim().split(/\s+/);

    const param = parts[1];
    if (!param) {
      await this.reply("❓ 请输入UID或用户名~\n示例: #B站粉丝曲线 8047632 30");
      return;
    }

    const resolved = await resolveTarget(param, String(this.e.group_id));
    if (resolved.error) {
      await this.reply(resolved.error);
      return;
    }

    const uid = resolved.uid;

    let rangeDays = parseInt(parts[2], 10);
    if (!rangeDays || isNaN(rangeDays) || rangeDays <= 0) {
      rangeDays = config.get("defaultChartRange", 30);
    }

    const validRanges = [7, 30, 90, 180, 365];
    if (!validRanges.includes(rangeDays)) {
      await this.reply(
        "❓ 不支持的时间范围: " + rangeDays + "天\n" +
        "支持的范围: " + validRanges.join("/") + " 天"
      );
      return;
    }

    const records = historyManager.getRecords(uid, rangeDays);

    if (records.length === 0) {
      await this.reply("📭 UID:" + uid + " 暂无历史数据~\n请先订阅该UP主，等待数据积累后再试~");
      return;
    }

    if (records.length < 2) {
      await this.reply(
        "📭 历史数据不足\n" +
        "至少需要2个数据点才能生成趋势图\n" +
        "当前记录数: " + records.length
      );
      return;
    }

    let nickname = "UP主" + uid;
    let face = '';
    let sign = '';
    try {
      const result = await bilibiliAPI.getFansCountAndNickname(uid);
      nickname = result.nickname || nickname;
      face = result.face || '';
      sign = result.sign || '';
    } catch {
      // use default
    }

    const latestRecord = records[records.length - 1];
    const textMsg =
      "📊 " + nickname + " 粉丝曲线\n" +
      "UID: " + uid + "\n" +
      "范围: 近" + rangeDays + "天\n" +
      "当前粉丝: " + formatFansCount(latestRecord.fansCount) +
      " | 数据点: " + records.length + "个";

    let chartBuffer = null;
    try {
      chartBuffer = await chartRenderer.renderFansChart(uid, nickname, records, rangeDays, face, sign, '');
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

export { ChartApp as default };
