/**
 * Cron 表达式构建器 & 解析器
 *
 * 目标：用户不需要理解 Cron，只需通过勾选时间单位生成计划任务。
 * 内部仍使用标准 Cron 表达式（兼容 node-schedule）。
 *
 * 输出格式（6 字段）：second minute hour day month dayOfWeek
 *   - second 固定为 0（不暴露给 UI）
 *   - dayOfWeek 固定为 *（不暴露给 UI）
 *   - node-schedule 不支持「年」字段
 */

// ── 选项生成 ──────────────────────────────────────────────

export const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  label: String(i),
  value: i,
}));

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  label: String(i) + '时',
  value: i,
}));

export const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({
  label: String(i + 1) + '日',
  value: i + 1,
}));

export const MONTH_OPTIONS = [
  { label: '1月', value: 1 },
  { label: '2月', value: 2 },
  { label: '3月', value: 3 },
  { label: '4月', value: 4 },
  { label: '5月', value: 5 },
  { label: '6月', value: 6 },
  { label: '7月', value: 7 },
  { label: '8月', value: 8 },
  { label: '9月', value: 9 },
  { label: '10月', value: 10 },
  { label: '11月', value: 11 },
  { label: '12月', value: 12 },
];

export const MODE_OPTIONS = [
  { label: '每分钟', value: 'everyMinute' },
  { label: '每小时', value: 'everyHour' },
  { label: '每日', value: 'everyDay' },
  { label: '每月', value: 'everyMonth' },
  { label: '每年', value: 'everyYear' },
];

// ── 默认选择 ──────────────────────────────────────────────

export function defaultSelection() {
  return {
    mode: 'everyDay',
    minute: [0],
    hour: [8],
    day: [1],
    month: [1],
    year: '*',
  };
}

// ── 构建 Cron ─────────────────────────────────────────────

/**
 * 将数值数组合并为 Cron 字段值
 * @param {number[]|string} arr - 数值数组或 '*'
 * @returns {string} Cron 字段字符串
 */
function joinValues(arr) {
  if (!arr || arr === '*') return '*';
  if (!Array.isArray(arr) || arr.length === 0) return '*';
  if (arr.length === 1) return String(arr[0]);
  return [...arr].sort((a, b) => a - b).join(',');
}

/**
 * 根据可视化选择构建 Cron 表达式
 *
 * @param {Object} selection
 * @param {string} selection.mode - 'everyMinute'|'everyHour'|'everyDay'|'everyMonth'|'everyYear'|'custom'
 * @param {number[]|string} [selection.minute]
 * @param {number[]|string} [selection.hour]
 * @param {number[]|string} [selection.day]
 * @param {number[]|string} [selection.month]
 * @param {number[]|string} [selection.year]
 * @param {string} [selection.cron] - 原始 Cron（custom 模式回退）
 * @returns {string} 7 字段 Cron 表达式
 */
export function buildCron(selection) {
  if (!selection) return '0 0 8 * * *';

  const { mode } = selection;

  // custom 模式：直接返回原始 Cron
  if (mode === 'custom') {
    return selection.cron || '0 0 8 * * *';
  }

  const m = joinValues(selection.minute);
  const h = joinValues(selection.hour);
  const d = joinValues(selection.day);
  const mo = joinValues(selection.month);

  switch (mode) {
    case 'everyMinute':
      return '0 * * * * *';

    case 'everyHour':
      return `0 ${m} * * * *`;

    case 'everyDay':
      return `0 ${m} ${h} * * *`;

    case 'everyMonth':
      return `0 ${m} ${h} ${d} * *`;

    case 'everyYear':
      return `0 ${m} ${h} ${d} ${mo} *`;

    default:
      return '0 0 8 * * *';
  }
}

// ── 解析 Cron ─────────────────────────────────────────────

/**
 * 将 Cron 字段值解析为数值数组或 '*'
 * @param {string} val - Cron 字段值
 * @returns {number[]|string}
 */
function parseField(val) {
  if (!val || val === '*' || val === '?') return '*';
  const nums = val.split(',').map(Number).filter((n) => !isNaN(n));
  return nums.length > 0 ? nums : '*';
}

/**
 * 将 Cron 表达式反向解析为可视化选择
 *
 * 支持 5/6/7 字段格式，自动归一化。
 *
 * @param {string} cronStr - Cron 表达式
 * @returns {Object} 选择对象（格式同 buildCron 输入）
 */
export function parseCron(cronStr) {
  if (!cronStr || typeof cronStr !== 'string') {
    return defaultSelection();
  }

  const parts = cronStr.trim().split(/\s+/);

  let second, minute, hour, day, month, dayOfWeek, year;

  if (parts.length === 5) {
    [minute, hour, day, month, dayOfWeek] = parts;
    second = '0';
    year = '*';
  } else if (parts.length === 6) {
    [second, minute, hour, day, month, dayOfWeek] = parts;
    year = '*';
  } else if (parts.length === 7) {
    [second, minute, hour, day, month, dayOfWeek, year] = parts;
  } else {
    return defaultSelection();
  }

  const minVals = parseField(minute);
  const hourVals = parseField(hour);
  const dayVals = parseField(day);
  const monthVals = parseField(month);
  const yearVals = parseField(year);

  // 从大到小判断模式

  // 年有具体值 → custom
  if (yearVals !== '*' && Array.isArray(yearVals) && yearVals.length > 0) {
    return {
      mode: 'custom',
      minute: minVals === '*' ? [0] : minVals,
      hour: hourVals === '*' ? [0] : hourVals,
      day: dayVals === '*' ? [1] : dayVals,
      month: monthVals === '*' ? [1] : monthVals,
      year: yearVals,
      cron: cronStr,
    };
  }

  // 月有具体值 → everyYear
  if (monthVals !== '*' && Array.isArray(monthVals) && monthVals.length > 0) {
    return {
      mode: 'everyYear',
      minute: minVals === '*' ? [0] : minVals,
      hour: hourVals === '*' ? [0] : hourVals,
      day: dayVals === '*' ? [1] : dayVals,
      month: monthVals,
      year: '*',
    };
  }

  // 日有具体值 → everyMonth
  if (dayVals !== '*' && Array.isArray(dayVals) && dayVals.length > 0) {
    return {
      mode: 'everyMonth',
      minute: minVals === '*' ? [0] : minVals,
      hour: hourVals === '*' ? [0] : hourVals,
      day: dayVals,
      month: '*',
      year: '*',
    };
  }

  // 小时有具体值 → everyDay
  if (hourVals !== '*' && Array.isArray(hourVals) && hourVals.length > 0) {
    return {
      mode: 'everyDay',
      minute: minVals === '*' ? [0] : minVals,
      hour: hourVals,
      day: '*',
      month: '*',
      year: '*',
    };
  }

  // 分钟有具体值 → everyHour
  if (minVals !== '*' && Array.isArray(minVals) && minVals.length > 0) {
    return {
      mode: 'everyHour',
      minute: minVals,
      hour: '*',
      day: '*',
      month: '*',
      year: '*',
    };
  }

  // 全是通配符 → everyMinute
  return {
    mode: 'everyMinute',
    minute: '*',
    hour: '*',
    day: '*',
    month: '*',
    year: '*',
  };
}

// ── 人类可读描述 ──────────────────────────────────────────

/**
 * 生成 Cron 表达式的人类可读中文描述
 * @param {string} cronStr
 * @returns {string}
 */
export function describeCron(cronStr) {
  const sel = parseCron(cronStr);

  const fmtList = (arr) => {
    if (!Array.isArray(arr)) return '?';
    if (arr.length <= 3) return arr.join(', ');
    return arr.slice(0, 3).join(', ') + '…（共' + arr.length + '个）';
  };

  switch (sel.mode) {
    case 'everyMinute':
      return '每分钟执行';

    case 'everyHour':
      return '每小时的第 ' + fmtList(sel.minute) + ' 分执行';

    case 'everyDay':
      return (
        '每天 ' +
        fmtList(sel.hour) +
        ' 时 ' +
        fmtList(sel.minute) +
        ' 分执行'
      );

    case 'everyMonth':
      return (
        '每月 ' +
        fmtList(sel.day) +
        ' 日 ' +
        fmtList(sel.hour) +
        ' 时 ' +
        fmtList(sel.minute) +
        ' 分执行'
      );

    case 'everyYear':
      return (
        '每年 ' +
        fmtList(sel.month) +
        ' 月 ' +
        fmtList(sel.day) +
        ' 日 ' +
        fmtList(sel.hour) +
        ' 时 ' +
        fmtList(sel.minute) +
        ' 分执行'
      );

    case 'custom':
      return '自定义: ' + cronStr;

    default:
      return cronStr;
  }
}

// ── 辅助：生成 Cron 编辑器 Schema ─────────────────────────

/**
 * 为一个 Cron 配置字段生成 Guoba schema 数组。
 *
 * @param {string} prefix    - 字段前缀，如 'updateCron'
 * @param {string} label     - 分组标题，如 '定时更新'
 * @param {string} defaultCron - 默认 Cron 表达式
 * @returns {Object[]} Guoba schema 数组
 */
export function makeCronSchemas(prefix, label, defaultCron) {
  const advKey = '_' + prefix + '_advancedMode';
  const modeKey = '_' + prefix + '_mode';
  const minKey = '_' + prefix + '_minute';
  const hourKey = '_' + prefix + '_hour';
  const dayKey = '_' + prefix + '_day';
  const monthKey = '_' + prefix + '_month';

  const isVisual = (m) => !m[advKey];
  const modeIs = (...names) => (m) => isVisual(m) && names.includes(m[modeKey]);

  return [
    { component: 'Divider', label },

    // ── 高级模式开关 ──
    {
      field: advKey,
      label: '高级模式',
      bottomHelpMessage: '开启后直接编辑 Cron 表达式（6 字段，含秒）。关闭后使用可视化编辑器',
      component: 'Switch',
      defaultValue: false,
    },

    // ── 可视化：执行频率 ──
    {
      field: modeKey,
      label: '执行频率',
      component: 'Select',
      required: true,
      componentProps: {
        options: MODE_OPTIONS,
        placeholder: '请选择执行频率',
      },
      defaultValue: 'everyDay',
      ifShow: isVisual,
    },

    // ── 可视化：分钟（everyHour / everyDay / everyMonth / everyYear）──
    {
      field: minKey,
      label: '分钟',
      component: 'Select',
      componentProps: {
        mode: 'multiple',
        options: MINUTE_OPTIONS,
        placeholder: '选择分钟（默认 0 分）',
        maxTagCount: 5,
      },
      ifShow: modeIs('everyHour', 'everyDay', 'everyMonth', 'everyYear'),
    },

    // ── 可视化：小时（everyDay / everyMonth / everyYear）──
    {
      field: hourKey,
      label: '小时',
      component: 'Select',
      componentProps: {
        mode: 'multiple',
        options: HOUR_OPTIONS,
        placeholder: '选择小时（默认 0 时）',
        maxTagCount: 5,
      },
      ifShow: modeIs('everyDay', 'everyMonth', 'everyYear'),
    },

    // ── 可视化：日期（everyMonth / everyYear）──
    {
      field: dayKey,
      label: '日期',
      component: 'Select',
      componentProps: {
        mode: 'multiple',
        options: DAY_OPTIONS,
        placeholder: '选择日期（默认 1 日）',
        maxTagCount: 5,
      },
      ifShow: modeIs('everyMonth', 'everyYear'),
    },

    // ── 可视化：月份（everyYear）──
    {
      field: monthKey,
      label: '月份',
      component: 'Select',
      componentProps: {
        mode: 'multiple',
        options: MONTH_OPTIONS,
        placeholder: '选择月份（默认 1 月）',
        maxTagCount: 5,
      },
      ifShow: modeIs('everyYear'),
    },

    // ── 高级模式：原始 Cron 输入 ──
    {
      field: prefix,
      label: 'Cron 表达式',
      bottomHelpMessage: '6 字段格式：秒 分 时 日 月 周。示例: 0 0 8 * * *',
      component: 'Input',
      required: true,
      componentProps: {
        placeholder: defaultCron,
        allowClear: true,
        style: { fontFamily: 'monospace' },
      },
      ifShow: (m) => !!m[advKey],
    },

    // ── 只读预览 ──
    {
      field: '_' + prefix + '_preview',
      label: '当前表达式',
      component: 'Input',
      componentProps: {
        readonly: true,
        style: { fontFamily: 'monospace', color: '#52c41a' },
      },
      ifShow: isVisual,
    },
  ];
}
