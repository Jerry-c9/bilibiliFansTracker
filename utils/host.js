import { pathToFileURL } from "url";
import { join } from "path";
import { _paths } from "./paths.js";

let Plugin, Segment;
const hostType = "trss";

try {
  const pluginPath = pathToFileURL(join(_paths.root, "lib", "plugins", "plugin.js")).href;
  const pluginModule = await import(pluginPath);
  Plugin = pluginModule.default || pluginModule;
} catch {
  Plugin = class Plugin {
    constructor(opts = {}) {
      this.name = opts.name || "";
      this.dsc = opts.dsc || "";
      this.event = opts.event || "message";
      this.priority = opts.priority || 5000;
      this.task = opts.task || { name: "", fnc: "", cron: "" };
      this.rule = opts.rule || [];
    }
    reply(msg, quote, data) {
      if (!this.e?.reply || !msg) return false;
      return this.e.reply(msg, quote, data);
    }
  };
}

// Segment 采用惰性解析：插件加载时 global.segment 可能尚未就绪，
// 若在加载期固定取值，运行期发送图片消息会拿到 undefined 而报错。
const _fallbackSegment = {
  image: (file) => file,
  at: (qq) => "[@" + qq + "]",
};

function _resolveSegment() {
  return globalThis.segment || globalThis.Segment || null;
}

Segment = new Proxy(_fallbackSegment, {
  get(target, prop) {
    const seg = _resolveSegment();
    if (seg && typeof seg[prop] === "function") {
      return seg[prop].bind(seg);
    }
    return target[prop];
  },
});

const logger =
  typeof globalThis !== "undefined" && globalThis.logger
    ? globalThis.logger
    : console;

/**
 * 命令处理包装器：捕获未预期的异常，仅在服务器端记录详情，
 * 向聊天发送固定的通用提示，避免把错误堆栈 / 文件路径 / 机器信息发送到群聊。
 *
 * @param {object} instance - 插件实例（需提供 reply 方法）
 * @param {Function} handler  - 实际处理函数
 * @returns {Promise<*>}
 */
async function guardPluginHandler(instance, handler) {
  try {
    return await handler.call(instance);
  } catch (err) {
    const detail = err && err.message ? err.message : String(err);
    if (typeof logger !== "undefined" && logger.error) {
      logger.error("[BilibiliFansTracker] 命令执行异常: " + detail);
    }
    try {
      if (instance && typeof instance.reply === "function") {
        await instance.reply("⚠️ 操作失败，请稍后重试~");
      }
    } catch {
      // 回复失败时静默处理，避免二次异常
    }
    return undefined;
  }
}

export { Plugin, Segment, hostType, logger, guardPluginHandler };
