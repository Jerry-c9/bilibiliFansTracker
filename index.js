import chalk from "chalk";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { _paths, pluginName } from "./utils/paths.js";
import SubscribeApp from "./apps/subscribe.js";
import QueryApp from "./apps/query.js";
import ChartApp from "./apps/chart.js";
import ExportApp from "./apps/export.js";
import ListApp from "./apps/list.js";
import HelpApp from "./apps/help.js";
import DebugApp from "./apps/debug.js";
import scheduler from "./models/scheduler.js";

const pluginVersion = "1.0.0";

// ── 启动自检 ──

function _ensureRuntimeDirs() {
  const dirs = [
    _paths.pluginData,
    _paths.historyDir,
    _paths.userCacheDir,
    _paths.avatarCacheDir,
    _paths.exportDir,
  ];

  for (const dir of dirs) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (err) {
      if (typeof logger !== "undefined" && logger.error) {
        logger.error("[BilibiliFansTracker][启动] 创建目录失败 " + dir + ": " + err.message);
      }
    }
  }
}

function _startupCheck() {
  if (typeof logger === "undefined") return;

  const checks = [
    { path: _paths.configFile, label: "配置文件 default.yaml" },
    { path: _paths.chartTemplate, label: "图表模板 chart_template.html" },
    { path: _paths.historyDir, label: "历史数据目录" },
    { path: _paths.avatarCacheDir, label: "头像缓存目录" },
    { path: _paths.userCacheDir, label: "用户缓存目录" },
    { path: _paths.pluginData, label: "插件数据目录" },
  ];

  let allOk = true;
  for (const check of checks) {
    const ok = existsSync(check.path);
    if (!ok) {
      logger.warn("[BilibiliFansTracker][启动自检] " + check.label + " 不存在: " + check.path);
      allOk = false;
    }
  }

  // Check ECharts
  const echartsPath = path.join(_paths.pluginPath, "node_modules", "echarts", "dist", "echarts.min.js");
  if (!existsSync(echartsPath)) {
    logger.warn("[BilibiliFansTracker][启动自检] ECharts 未找到: " + echartsPath);
    allOk = false;
  }

  if (allOk) {
    logger.info("[BilibiliFansTracker][启动自检] 全部通过 ✅");
  }
}

// ── 应用注册 ──

const apps = {
  SubscribeApp,
  QueryApp,
  ChartApp,
  ExportApp,
  ListApp,
  HelpApp,
  DebugApp,
};

const rules = {};
let count = 0;

for (const key in apps) {
  if (!apps[key]) {
    if (typeof logger !== "undefined" && logger.error) {
      logger.error("[BilibiliFansTracker] 载入插件错误: " + key);
    }
    continue;
  }
  rules[key] = apps[key];
  count++;
}

if (typeof logger !== "undefined") {
  logger.info(chalk.rgb(251, 114, 153)("-----------------------------------------"));
  logger.info(chalk.rgb(255, 225, 255)("B站粉丝追踪插件 " + pluginVersion + " 初始化~"));
  logger.info(chalk.rgb(255, 245, 255)("功能: B站UP主粉丝数追踪、订阅推送、历史曲线"));
  logger.info(chalk.rgb(251, 114, 153)("-----------------------------------------"));
  logger.info(chalk.rgb(251, 114, 153)("B站粉丝追踪插件加载完成，共计加载 " + count + " 个app"));
}

_ensureRuntimeDirs();
_startupCheck();

scheduler.start();

export { rules as apps };
