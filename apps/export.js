import { Plugin, Segment } from "../utils/host.js";
import { isGroupChat } from "../utils/permission.js";
import { guardPluginHandler } from "../utils/host.js";
import { extractParamFromMsg } from "../utils/format.js";
import historyManager from "../models/history.manager.js";
import csvExporter from "../models/csv.exporter.js";
import bilibiliAPI from "../models/bilibili.api.js";
import { readFileSync, existsSync } from "fs";
import { basename } from "path";
import { resolveTarget } from "../utils/targetResolver.js";

class ExportApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:导出|下载|备份)\\s*(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝历史\\s+\\S+$",
        fnc: "exportHistory",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-Export",
      dsc: "B站粉丝历史导出",
      rule: rules,
    });
  }

  async exportHistory() {
    return guardPluginHandler(this, this._exportHistory);
  }

  async _exportHistory() {
    if (isGroupChat(this.e)) {
      await this.reply("📬 请私聊机器人执行该命令~\n导出文件较大，群聊发送可能不便哦");
      return;
    }

    const resolved = await resolveTarget(extractParamFromMsg(this.e.msg), String(this.e.group_id || "0"));
    if (resolved.error) {
      await this.reply(resolved.error);
      return;
    }

    const uid = resolved.uid;

    const records = historyManager.getRecords(uid, 0);

    if (records.length === 0) {
      await this.reply("📭 该UID暂无历史数据~");
      return;
    }

    let nickname = "UP主" + uid;
    try {
      const result = await bilibiliAPI.getFansCountAndNickname(uid);
      nickname = result.nickname || nickname;
    } catch {
      // use default nickname
    }

    let filePath = "";
    try {
      filePath = csvExporter.exportToCSV(uid, nickname, records);
    } catch (err) {
      if (typeof logger !== "undefined" && logger.error) {
        logger.error("[BilibiliFansTracker] CSV导出失败: " + err.message);
      }
      await this.reply("⚠️ CSV导出失败，请稍后再试~");
      return;
    }

    const fileName = basename(filePath);

    const infoMsg =
      "📁 导出完成\n" +
      "文件已保存到 data/exports/\n\n" +
      "文件名：\n" +
      fileName + "\n\n" +
      "UP主: " + nickname + "\n" +
      "UID: " + uid + "\n" +
      "记录数: " + records.length + " 条";

    let fileSent = false;

    try {
      if (existsSync(filePath)) {
        if (this.e.reply) {
          try {
            const seg = Segment;
            if (seg && typeof seg.file === "function") {
              const fileUrl = "file:///" + filePath.replace(/\\/g, "/");
              await this.e.reply([infoMsg, seg.file(fileUrl, fileName)]);
              fileSent = true;
            }
          } catch {
            // fall through
          }
        }

        if (!fileSent && typeof Bot !== "undefined") {
          try {
            if (Bot.sendPrivateMsg && this.e.user_id) {
              await Bot.sendPrivateMsg(this.e.user_id, infoMsg);
              fileSent = true;
            }
          } catch {
            // fall through
          }
        }
      }
    } catch {
      // ignore send errors
    }

    if (!fileSent) {
      await this.reply(infoMsg);
    }
  }
}

export { ExportApp as default };
