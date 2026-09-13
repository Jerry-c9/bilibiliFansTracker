import path from "path";
import fs from "fs";
import YAML from "yaml";
import lodash from "lodash";
import { _paths } from "./utils/paths.js";
import { DEFAULT_CONFIG } from "./utils/config.js";
import {
  buildCron,
  parseCron,
  describeCron,
  makeCronSchemas,
} from "./utils/cronBuilder.js";

function _guobaLogError(...args) {
  if (typeof logger !== "undefined" && logger.error) {
    logger.error(...args);
  } else {
    console.error(...args);
  }
}

function getGuobaConfigPath() {
  return path.join(_paths.pluginData, "guoba.config.yaml");
}

function readGuobaConfig() {
  try {
    const guobaPath = getGuobaConfigPath();
    if (!fs.existsSync(guobaPath)) {
      return null;
    }
    const content = fs.readFileSync(guobaPath, "utf8");
    return YAML.parse(content) || null;
  } catch {
    return null;
  }
}

function saveGuobaConfig(data) {
  try {
    const guobaPath = getGuobaConfigPath();
    const dir = path.dirname(guobaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const yamlContent = YAML.stringify(data);
    fs.writeFileSync(guobaPath, yamlContent, "utf8");
    return true;
  } catch (err) {
    _guobaLogError("[BilibiliFansTracker][Guoba] 保存配置失败:", err);
    return false;
  }
}

// ── 辅助：展开一个 Cron 字段到可视化子字段 ──

function expandCronField(cronStr, prefix) {
  const sel = parseCron(cronStr);
  const result = {};

  result['_' + prefix + '_advancedMode'] = sel.mode === 'custom';
  result['_' + prefix + '_mode'] = sel.mode === 'custom' ? 'everyDay' : sel.mode;
  result['_' + prefix + '_minute'] = Array.isArray(sel.minute) ? sel.minute : [];
  result['_' + prefix + '_hour'] = Array.isArray(sel.hour) ? sel.hour : [];
  result['_' + prefix + '_day'] = Array.isArray(sel.day) ? sel.day : [];
  result['_' + prefix + '_month'] = Array.isArray(sel.month) ? sel.month : [];
  result['_' + prefix + '_preview'] = describeCron(cronStr);

  // 保留原始 cron 值
  result[prefix] = cronStr;

  return result;
}

// ── 辅助：从可视化子字段收集并构建 Cron ──

function collectCronField(formData, prefix, defaultCron) {
  const advKey = '_' + prefix + '_advancedMode';

  // 高级模式：直接使用原始输入
  if (formData[advKey]) {
    return formData[prefix] || defaultCron;
  }

  // 可视化模式：构建
  const modeKey = '_' + prefix + '_mode';
  const minKey = '_' + prefix + '_minute';
  const hourKey = '_' + prefix + '_hour';
  const dayKey = '_' + prefix + '_day';
  const monthKey = '_' + prefix + '_month';

  const selection = {
    mode: formData[modeKey] || 'everyDay',
    minute: formData[minKey],
    hour: formData[hourKey],
    day: formData[dayKey],
    month: formData[monthKey],
  };

  return buildCron(selection);
}

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "bilibiliFansTracker",
      title: "B站粉丝追踪",
      author: ["Jerry_c9"],
      link: "https://github.com/Jerry-c9/bilibiliFansTracker",
      isV3: true,
      isV2: false,
      description: "追踪B站UP主粉丝数量变化，支持订阅推送、历史曲线与数据导出",
      icon: "mdi:chart-line",
      iconColor: "#FB7299",
    },

    configInfo: {
      schemas: [
        {
          component: "Divider",
          label: "基础设置",
        },
        {
          field: "enabled",
          label: "插件开关",
          bottomHelpMessage: "关闭后定时任务不再执行，需要重启Yunzai生效",
          component: "Switch",
          defaultValue: true,
        },

        {
          component: "Divider",
          label: "订阅限制",
        },
        {
          field: "maxSubscriptionsPerGroup",
          label: "每群最大订阅数",
          bottomHelpMessage: "单个群最多订阅的UP主数量，需要重启Yunzai生效",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 1,
            max: 500,
            placeholder: "默认100",
          },
          defaultValue: 100,
        },

        // ═══════════════════════════════════════════════════
        // 定时更新（可视化 Cron 编辑器）
        // ═══════════════════════════════════════════════════
        ...makeCronSchemas("updateCron", "定时更新", "0 0 8 * * *"),

        // ═══════════════════════════════════════════════════
        // 定时推送（可视化 Cron 编辑器）
        // ═══════════════════════════════════════════════════
        ...makeCronSchemas("pushCron", "定时推送", "0 5 8 * * *"),

        {
          component: "Divider",
          label: "历史数据",
        },
        {
          field: "historyRetentionDays",
          label: "历史保留天数",
          bottomHelpMessage: "超过此天数的历史记录将被自动清理，需要重启Yunzai生效",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 7,
            max: 730,
            placeholder: "默认365天",
          },
          defaultValue: 365,
        },

        // ═══════════════════════════════════════════════════
        // 定时清理（可视化 Cron 编辑器）
        // ═══════════════════════════════════════════════════
        ...makeCronSchemas("cleanupCron", "定时清理", "0 0 4 * * *"),

        {
          component: "Divider",
          label: "图表设置",
        },
        {
          field: "defaultChartRange",
          label: "默认图表范围",
          bottomHelpMessage: "查询时默认显示的图表时间范围",
          component: "Select",
          required: true,
          componentProps: {
            options: [
              { label: "近7天", value: 7 },
              { label: "近30天", value: 30 },
              { label: "近90天", value: 90 },
              { label: "近180天", value: 180 },
              { label: "近365天", value: 365 },
            ],
            placeholder: "请选择默认图表范围",
          },
          defaultValue: 30,
        },

        {
          component: "Divider",
          label: "里程碑提醒",
        },
        {
          field: "milestoneEnabled",
          label: "启用里程碑提醒",
          bottomHelpMessage: "粉丝数突破设定阈值时推送庆祝消息",
          component: "Switch",
          defaultValue: true,
        },
        {
          field: "milestones",
          label: "里程碑阈值 (万)",
          bottomHelpMessage: "粉丝数突破这些值时触发提醒，每行一个数字",
          component: "GTags",
          componentProps: {
            placeholder: "请输入里程碑阈值(万)",
            allowAdd: true,
            allowDel: true,
          },
          defaultValue: [10, 50, 100, 500, 1000],
        },

        {
          component: "Divider",
          label: "推送优化",
        },
        {
          field: "mergeForwardThreshold",
          label: "合并转发阈值",
          bottomHelpMessage: "群订阅变化UP数超过此值时使用合并转发，≤此值逐条发送。QQ官方Bot不支持合并转发时自动降级",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 1,
            max: 50,
            placeholder: "默认3",
          },
          defaultValue: 3,
        },
        {
          component: "Divider",
          label: "调试输出",
        },
        {
          field: "debugKeepHtml",
          label: "保留调试 HTML",
          bottomHelpMessage: "开启后图表渲染的临时HTML文件不会自动删除，方便浏览器打开排查",
          component: "Switch",
          defaultValue: false,
        },

        {
          component: "Divider",
          label: "推送显示",
        },
        {
          field: "showLastChange",
          label: "显示较上次变化",
          bottomHelpMessage: "推送消息中显示与上次记录的粉丝数变化",
          component: "Switch",
          defaultValue: true,
        },
        {
          field: "showWeekChange",
          label: "显示较7天前变化",
          bottomHelpMessage: "推送消息中显示与7天前的粉丝数变化",
          component: "Switch",
          defaultValue: true,
        },

        {
          component: "Divider",
          label: "调试设置",
        },
        {
          field: "debug.enabled",
          label: "调试模式",
          bottomHelpMessage: "开启后保留HTML/截图，输出详细日志，立即生效无需重启",
          component: "Switch",
          defaultValue: false,
        },

        {
          component: "Divider",
          label: "API 设置",
        },
        {
          field: "apiTimeout",
          label: "请求超时 (毫秒)",
          bottomHelpMessage: "B站API请求超时时间",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 3000,
            max: 30000,
            placeholder: "默认10000",
          },
          defaultValue: 10000,
        },
        {
          field: "apiRetryCount",
          label: "请求重试次数",
          bottomHelpMessage: "B站API请求失败后的重试次数",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 0,
            max: 5,
            placeholder: "默认3",
          },
          defaultValue: 3,
        },
        {
          field: "userAgent",
          label: "User-Agent",
          bottomHelpMessage: "请求B站API使用的User-Agent",
          component: "Input",
          required: true,
          componentProps: {
            placeholder: "请输入User-Agent",
          },
          defaultValue:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        },
      ],

      // ── 读取配置：展开 Cron 子字段 ──
      getConfigData() {
        const guobaConfig = readGuobaConfig();
        let raw;

        if (guobaConfig) {
          raw = guobaConfig;
        } else {
          try {
            const configPath = _paths.configFile;
            if (fs.existsSync(configPath)) {
              const fileContent = fs.readFileSync(configPath, "utf8");
              const userConfig = YAML.parse(fileContent) || {};
              raw = lodash.merge({}, DEFAULT_CONFIG, userConfig);
            }
          } catch {
            // fall through
          }
        }

        if (!raw) {
          raw = lodash.cloneDeep(DEFAULT_CONFIG);
        }

        // 展开 Cron 字段
        const result = lodash.cloneDeep(raw);

        const updateCron = result.updateCron || "0 0 8 * * *";
        const pushCron = result.pushCron || "0 5 8 * * *";
        const cleanupCron = result.cleanupCron || "0 0 4 * * *";

        Object.assign(result, expandCronField(updateCron, "updateCron"));
        Object.assign(result, expandCronField(pushCron, "pushCron"));
        Object.assign(result, expandCronField(cleanupCron, "cleanupCron"));

        return result;
      },

      // ── 保存配置：收集 Cron 子字段 → 构建 Cron 字符串 ──
      setConfigData(data, { Result }) {
        try {
          // 从可视化子字段构建 Cron 表达式
          const updateCron = collectCronField(data, "updateCron", "0 0 8 * * *");
          const pushCron = collectCronField(data, "pushCron", "0 5 8 * * *");
          const cleanupCron = collectCronField(data, "cleanupCron", "0 0 4 * * *");

          // 构建要保存的纯净配置（只保留业务字段，去掉可视化辅助字段）
          const toSave = {};

          // 复制所有非辅助字段
          for (const key of Object.keys(data)) {
            // 跳过可视化辅助字段（以 _ 开头的内部字段）
            if (key.startsWith("_")) continue;
            toSave[key] = data[key];
          }

          // 覆盖 Cron 字段为构建后的值
          toSave.updateCron = updateCron;
          toSave.pushCron = pushCron;
          toSave.cleanupCron = cleanupCron;

          const saved = saveGuobaConfig(toSave);
          if (!saved) {
            return Result.error("保存配置失败");
          }

          return Result.ok({}, "配置已保存~ 需要重启Yunzai生效");
        } catch (err) {
          _guobaLogError("[BilibiliFansTracker][Guoba] setConfigData 失败:", err);
          return Result.error("保存配置失败: " + err.message);
        }
      },
    },
  };
}
