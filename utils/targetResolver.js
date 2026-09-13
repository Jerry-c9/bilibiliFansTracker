import { isValidUid } from "./format.js";
import subscriptionManager from "../models/subscription.manager.js";
import bilibiliAPI from "../models/bilibili.api.js";

/**
 * 统一目标解析器
 *
 * 解析流程：
 *   1. 纯数字 → 校验 UID → 返回
 *   2. 查找本群订阅列表
 *   3. 精确匹配（区分大小写）→ 返回
 *   4. 精确匹配（忽略大小写）→ 返回
 *   5. 唯一包含匹配 → 返回
 *   6. 多个匹配 → 列出候选项（不调 API）
 *   7. 无匹配 → 调用 B 站搜索 API
 *
 * @param {string} raw - 用户输入的原始参数（UID 或昵称）
 * @param {string} groupId - 当前群 ID
 * @returns {Promise<{ uid?: string, error?: string }>}
 */
export async function resolveTarget(raw, groupId) {
  if (!raw) {
    return { error: "❓ 请输入UID或用户名~" };
  }

  const trimmed = raw.trim();

  // ── 1. 纯数字 → UID ──
  if (/^\d+$/.test(trimmed)) {
    if (!isValidUid(trimmed)) {
      return { error: "❓ UID格式不正确~" };
    }
    return { uid: trimmed };
  }

  // ── 2. 获取本群订阅列表 ──
  const subs = subscriptionManager.getGroupSubscriptions(String(groupId));

  if (subs.length > 0) {
    // ── 3. 完全匹配（区分大小写）──
    const exactMatch = subs.filter((s) => (s.nickname || '') === trimmed);
    if (exactMatch.length === 1) {
      return { uid: exactMatch[0].uid };
    }

    // ── 4. 完全匹配（忽略大小写）──
    const caseInsensitiveMatch = subs.filter(
      (s) => (s.nickname || '').toLowerCase() === trimmed.toLowerCase()
    );
    if (caseInsensitiveMatch.length === 1) {
      return { uid: caseInsensitiveMatch[0].uid };
    }

    // ── 5. 唯一包含匹配 ──
    const containsMatch = subs.filter((s) =>
      (s.nickname || '').toLowerCase().includes(trimmed.toLowerCase())
    );
    if (containsMatch.length === 1) {
      return { uid: containsMatch[0].uid };
    }

    // ── 6. 多个匹配 → 列出候选项 ──
    if (containsMatch.length > 1) {
      const lines = ["🔍 本群已订阅的UP中有多个匹配：", ""];
      const maxShow = Math.min(containsMatch.length, 5);
      for (let i = 0; i < maxShow; i++) {
        const s = containsMatch[i];
        lines.push((i + 1) + ". " + s.nickname);
        lines.push("   UID:" + s.uid);
        if (i < maxShow - 1) lines.push("");
      }
      lines.push("");
      lines.push("💡 请使用完整昵称或UID");
      return { error: lines.join("\n") };
    }
  }

  // ── 7. 无匹配 → 调用 B 站搜索 ──
  let results;
  try {
    results = await bilibiliAPI.searchUser(trimmed);
  } catch {
    return { error: "🌐 搜索失败，请稍后再试~" };
  }

  if (!results || results.length === 0) {
    return { error: "🔍 未找到匹配的UP主" };
  }

  if (results.length === 1) {
    return { uid: results[0].uid };
  }

  // 多个搜索结果
  const lines = ["🔍 找到多个UP主：", ""];
  const maxShow = Math.min(results.length, 5);
  for (let i = 0; i < maxShow; i++) {
    const r = results[i];
    lines.push((i + 1) + ". " + r.nickname);
    lines.push("UID:" + r.uid);
    if (i < maxShow - 1) lines.push("");
  }
  lines.push("");
  lines.push("请使用UID重新执行命令");
  return { error: lines.join("\n") };
}
