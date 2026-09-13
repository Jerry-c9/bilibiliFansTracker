import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFansCount,
  formatChange,
  formatChangeDirection,
  isValidUid,
  getMilestoneValue,
} from "../utils/format.js";

import {
  buildCron,
  parseCron,
  describeCron,
} from "../utils/cronBuilder.js";

import { lttb, downsampleRecords } from "../utils/lttb.js";

import {
  isGroupChat,
  isPrivateChat,
  isMaster,
  checkSubscribePermission,
} from "../utils/permission.js";

test("formatFansCount 处理空值与单位换算", () => {
  assert.equal(formatFansCount(null), "0");
  assert.equal(formatFansCount(undefined), "0");
  assert.equal(formatFansCount(NaN), "0");
  assert.equal(formatFansCount(999), "999");
  assert.equal(formatFansCount(12345), "1.2万");
  assert.equal(formatFansCount(100000000), "1.0亿");
});

test("formatChange 输出正负符号", () => {
  assert.equal(formatChange(0), "0");
  assert.equal(formatChange(1234), "+1,234");
  assert.equal(formatChange(-12345), "-1.2万");
});

test("formatChangeDirection 输出方向图标", () => {
  assert.equal(formatChangeDirection(1), "📈");
  assert.equal(formatChangeDirection(-1), "📉");
  assert.equal(formatChangeDirection(0), "→");
});

test("isValidUid 校验规则", () => {
  assert.equal(isValidUid("123"), true);
  assert.equal(isValidUid(123), true);
  assert.equal(isValidUid("abc"), false);
  assert.equal(isValidUid(""), false);
  assert.equal(isValidUid("0"), false);
  assert.equal(isValidUid("99999999999999999"), false);
});

test("getMilestoneValue 单位换算", () => {
  assert.equal(getMilestoneValue(5000), 5000);
  assert.equal(getMilestoneValue(123456), 12);
  assert.equal(getMilestoneValue(123456789), 1);
});

test("cronBuilder 默认值可往返解析", () => {
  const cron = buildCron({ mode: "everyDay", minute: [0], hour: [8] });
  assert.equal(cron, "0 0 8 * * *");

  const parsed = parseCron(cron);
  assert.equal(parsed.mode, "everyDay");
  assert.deepEqual(parsed.minute, [0]);
  assert.deepEqual(parsed.hour, [8]);
});

test("cronBuilder 多值排序输出", () => {
  assert.equal(
    buildCron({ mode: "everyDay", minute: [30, 0], hour: [8, 20] }),
    "0 0,30 8,20 * * *"
  );
});

test("cronBuilder custom 模式原样返回", () => {
  assert.equal(buildCron({ mode: "custom", cron: "0 5 8 * * *" }), "0 5 8 * * *");
});

test("describeCron 生成可读描述", () => {
  assert.match(describeCron("0 0 8 * * *"), /每天/);
});

test("lttb 保留首尾并压缩到阈值", () => {
  const data = Array.from({ length: 100 }, (_, i) => ({
    timestamp: i,
    fansCount: i * i,
  }));

  const sampled = lttb(data, 10);
  assert.equal(sampled.length, 10);
  assert.equal(sampled[0], data[0]);
  assert.equal(sampled[sampled.length - 1], data[data.length - 1]);
});

test("lttb 阈值大于等于数据量时原样返回", () => {
  const data = [
    { timestamp: 1, fansCount: 1 },
    { timestamp: 2, fansCount: 2 },
  ];
  assert.equal(lttb(data, 5).length, 2);
  assert.deepEqual(downsampleRecords(data, 5), data);
});

test("permission 群聊/私聊判定", () => {
  assert.equal(isGroupChat({ isGroup: true }), true);
  assert.equal(isGroupChat({ group_id: "1" }), true);
  assert.equal(isGroupChat({ user_id: "1" }), false);
  assert.equal(isPrivateChat({ user_id: "1" }), true);
});

test("permission 主人判定", () => {
  assert.equal(isMaster({ isMaster: true }), true);
  assert.equal(isMaster({ isMaster: () => true }), true);
  assert.equal(isMaster({}), false);
});

test("permission 订阅权限：非群聊拒绝", () => {
  const result = checkSubscribePermission({ user_id: "1" });
  assert.equal(result.allowed, false);
});

test("permission 订阅权限：主人放行", () => {
  const result = checkSubscribePermission({ isGroup: true, isMaster: true });
  assert.equal(result.allowed, true);
});

test("permission 订阅权限：普通群成员拒绝", () => {
  const result = checkSubscribePermission({ isGroup: true, sender: { role: "member" } });
  assert.equal(result.allowed, false);
});

test("permission 订阅权限：群主放行", () => {
  const result = checkSubscribePermission({ isGroup: true, sender: { role: "owner" } });
  assert.equal(result.allowed, true);
});
