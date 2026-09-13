import { readFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { _paths } from '../utils/paths.js';
import config from '../utils/config.js';
import {
  ensureDir,
  atomicWriteFileSync,
  quarantineCorruptFile,
} from '../utils/storage.js';

function _getHistoryFilePath(uid) {
  return join(_paths.historyDir, `${uid}.json`);
}

function _ensureHistoryDir() {
  ensureDir(_paths.historyDir);
}

function _readHistoryFile(uid) {
  const filePath = _getHistoryFilePath(uid);

  if (!existsSync(filePath)) {
    return { uid: String(uid), records: [] };
  }

  let raw;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return { uid: String(uid), records: [] };
  }

  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      throw new Error('历史数据格式不正确');
    }
    if (!Array.isArray(data.records)) {
      data.records = [];
    }
    return data;
  } catch (err) {
    const backup = quarantineCorruptFile(filePath);
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(
        '[BilibiliFansTracker] 历史数据文件损坏 (UID:' + uid + ')，已隔离' +
        (backup ? '到 ' + backup : '') + ': ' + (err.message || 'unknown')
      );
    }
    return { uid: String(uid), records: [] };
  }
}

function _writeHistoryFile(uid, data) {
  const filePath = _getHistoryFilePath(uid);
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

function _isDebug() {
  return config.get('debug.enabled', false);
}

function _debugLog(msg) {
  if (!_isDebug()) return;
  if (typeof logger !== 'undefined' && logger.mark) {
    logger.mark('[BilibiliFansTracker][History] ' + msg);
  }
}

function _infoLog(msg) {
  if (typeof logger !== 'undefined' && logger.info) {
    logger.info('[BilibiliFansTracker][History] ' + msg);
  }
}

// ── Min-Max Aggregation ─────────────────────────────────

/**
 * 将记录按时间桶聚合，每个桶保留 first / last / max / min
 *
 * @param {Array} records - 已按时间排序的记录数组
 * @param {number} bucketMs - 时间桶大小（毫秒）
 * @returns {Array} 聚合后的记录（去重，按时间排序）
 */
function _aggregateBucket(records, bucketMs) {
  if (records.length === 0) return [];

  const buckets = new Map();

  for (const r of records) {
    const bucketKey = Math.floor(r.timestamp / bucketMs) * bucketMs;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey).push(r);
  }

  const result = [];

  for (const [, bucketRecords] of buckets) {
    if (bucketRecords.length <= 4) {
      // 桶内记录少，全部保留
      for (const r of bucketRecords) {
        result.push(r);
      }
      continue;
    }

    // 找 first, last, max, min
    const first = bucketRecords[0];
    const last = bucketRecords[bucketRecords.length - 1];

    let maxRecord = bucketRecords[0];
    let minRecord = bucketRecords[0];
    for (const r of bucketRecords) {
      if (r.fansCount > maxRecord.fansCount) maxRecord = r;
      if (r.fansCount < minRecord.fansCount) minRecord = r;
    }

    // 收集去重（按 timestamp 去重）
    const dedup = new Map();
    for (const r of [first, last, maxRecord, minRecord]) {
      dedup.set(r.timestamp, r);
    }

    for (const r of dedup.values()) {
      result.push(r);
    }
  }

  // 按时间排序
  result.sort((a, b) => a.timestamp - b.timestamp);
  return result;
}

/**
 * 对单个 UID 的历史记录执行分层压缩
 *
 * 规则：
 *   0~7天：完全保留
 *   7~30天：按小时聚合
 *   30~180天：按6小时聚合
 *   180天以上：按天聚合
 *
 * @param {string} uid
 * @returns {{ originalCount: number, compactedCount: number, ratio: number }}
 */
function compactHistory(uid) {
  const data = _readHistoryFile(uid);
  const originalCount = data.records.length;

  if (originalCount <= 1) {
    return { originalCount, compactedCount: originalCount, ratio: 0 };
  }

  const now = Date.now();

  const DAY_MS = 24 * 60 * 60 * 1000;
  const HOUR_MS = 60 * 60 * 1000;

  // 时间分界点
  const cutoff7d = now - 7 * DAY_MS;
  const cutoff30d = now - 30 * DAY_MS;
  const cutoff180d = now - 180 * DAY_MS;

  // 分区
  const recent = [];       // 0~7天
  const weekToMonth = [];  // 7~30天
  const monthToHalf = [];  // 30~180天
  const old = [];          // 180天以上

  for (const r of data.records) {
    if (r.timestamp >= cutoff7d) {
      recent.push(r);
    } else if (r.timestamp >= cutoff30d) {
      weekToMonth.push(r);
    } else if (r.timestamp >= cutoff180d) {
      monthToHalf.push(r);
    } else {
      old.push(r);
    }
  }

  // 聚合各分区
  const compactedWeekToMonth = _aggregateBucket(weekToMonth, HOUR_MS);
  const compactedMonthToHalf = _aggregateBucket(monthToHalf, 6 * HOUR_MS);
  const compactedOld = _aggregateBucket(old, DAY_MS);

  // 合并
  const compacted = [
    ...compactedOld,
    ...compactedMonthToHalf,
    ...compactedWeekToMonth,
    ...recent,
  ];

  compacted.sort((a, b) => a.timestamp - b.timestamp);

  data.records = compacted;
  _writeHistoryFile(uid, data);

  const compactedCount = compacted.length;
  const ratio = originalCount > 0
    ? ((1 - compactedCount / originalCount) * 100).toFixed(1)
    : 0;

  return { originalCount, compactedCount, ratio };
}

/**
 * 对所有 UID 执行历史压缩
 * @returns {{ totalOriginal: number, totalCompacted: number, totalRatio: number, details: Array }}
 */
async function compactAllHistory() {
  _ensureHistoryDir();

  let totalOriginal = 0;
  let totalCompacted = 0;
  const details = [];

  try {
    const files = readdirSync(_paths.historyDir);

    const uidList = files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

      for (let i = 0; i < uidList.length; i++) {
        const uid = uidList[i];
        try {
          const startMs = Date.now();
          const result = compactHistory(uid);
          totalOriginal += result.originalCount;
          totalCompacted += result.compactedCount;
          details.push({ uid, ...result });

          if (_isDebug()) {
            _debugLog('UID ' + uid + ' 压缩完成 耗时: ' + (Date.now() - startMs) + 'ms');
          }
        } catch (err) {
          _infoLog('压缩 UID ' + uid + ' 失败: ' + (err.message || 'unknown'));
        }
      }
  } catch {
    // directory may not exist
  }

  const totalRatio = totalOriginal > 0
    ? ((1 - totalCompacted / totalOriginal) * 100).toFixed(1)
    : 0;

  return { totalOriginal, totalCompacted, totalRatio, details };
}

// ── HistoryManager ───────────────────────────────────────

class HistoryManager {
  addRecord(uid, fansCount, source) {
    if (fansCount === null || fansCount === undefined) {
      return;
    }

    const data = _readHistoryFile(uid);
    const record = {
      timestamp: Date.now(),
      fansCount: Number(fansCount),
      source: source || 'manual',
    };

    data.records.push(record);
    _writeHistoryFile(uid, data);
  }

  getRecords(uid, rangeDays) {
    const data = _readHistoryFile(uid);

    if (!rangeDays || rangeDays <= 0) {
      return data.records;
    }

    const cutoffTime = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return data.records.filter((r) => r.timestamp >= cutoffTime);
  }

  getLatestRecord(uid) {
    const data = _readHistoryFile(uid);

    if (data.records.length === 0) {
      return null;
    }

    return data.records[data.records.length - 1];
  }

  getRecordDaysAgo(uid, days) {
    const data = _readHistoryFile(uid);

    if (data.records.length === 0) {
      return null;
    }

    const targetTime = Date.now() - days * 24 * 60 * 60 * 1000;

    let closest = null;
    let minDiff = Infinity;

    for (const record of data.records) {
      const diff = Math.abs(record.timestamp - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = record;
      }
    }

    if (closest) {
      const actualDiffDays = Math.abs(closest.timestamp - targetTime) / (24 * 60 * 60 * 1000);
      if (actualDiffDays > days * 0.5) {
        return null;
      }
    }

    return closest;
  }

  getRecordCount(uid) {
    const data = _readHistoryFile(uid);
    return data.records.length;
  }

  cleanup(retentionDays) {
    const days = retentionDays || config.get('historyRetentionDays', 365);
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    _ensureHistoryDir();

    let totalRemoved = 0;

    try {
      const files = readdirSync(_paths.historyDir);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(_paths.historyDir, file);
        const uid = file.replace('.json', '');

        try {
          const data = _readHistoryFile(uid);
          const originalCount = data.records.length;

          data.records = data.records.filter((r) => r.timestamp >= cutoffTime);
          const removed = originalCount - data.records.length;
          totalRemoved += removed;

          if (data.records.length === 0) {
            unlinkSync(filePath);
          } else if (removed > 0) {
            _writeHistoryFile(uid, data);
          }
        } catch {
          // skip corrupted files
        }
      }
    } catch {
      // directory may not exist
    }

    return totalRemoved;
  }

  // ── 历史压缩（新增）──

  compactHistory(uid) {
    return compactHistory(uid);
  }

  async compactAllHistory() {
    _infoLog('开始归档历史数据');

    const result = await compactAllHistory();

    if (_isDebug()) {
      for (const d of result.details) {
        _debugLog(
          'UID ' + d.uid +
          ' 原记录数: ' + d.originalCount +
          ' 压缩后: ' + d.compactedCount +
          ' 压缩率: ' + d.ratio + '%'
        );
      }
    }

    _infoLog(
      '归档完成: 总原始=' + result.totalOriginal +
      ' 总压缩后=' + result.totalCompacted +
      ' 总压缩率=' + result.totalRatio + '%'
    );

    return result;
  }

  getFirstRecordDate(uid) {
    const data = _readHistoryFile(uid);

    if (data.records.length === 0) {
      return null;
    }

    return data.records[0].timestamp;
  }

  getAllUidsWithHistory() {
    _ensureHistoryDir();

    try {
      const files = readdirSync(_paths.historyDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }
}

const historyManager = new HistoryManager();

export { historyManager as default, HistoryManager };
