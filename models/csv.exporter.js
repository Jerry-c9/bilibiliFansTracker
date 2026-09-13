import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { _paths } from '../utils/paths.js';
import { formatTime, formatNumber } from '../utils/format.js';

function _ensureExportDir() {
  if (!existsSync(_paths.exportDir)) {
    mkdirSync(_paths.exportDir, { recursive: true });
  }
}

function _escapeCSVField(field) {
  if (field === null || field === undefined) {
    return '';
  }

  const str = String(field);

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

function _buildCSVLine(fields) {
  return fields.map(_escapeCSVField).join(',');
}

class CSVExporter {
  exportToCSV(uid, nickname, records) {
    _ensureExportDir();

    const safeNickname = (nickname || 'unknown').replace(/[\\/:*?"<>|]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `fans_history_${uid}_${safeNickname}_${timestamp}.csv`;
    const filePath = join(_paths.exportDir, fileName);

    const lines = [];

    lines.push('\uFEFF' + _buildCSVLine(['时间', '粉丝数', '数据来源']));

    const sourceMap = {
      scheduled: '定时更新',
      manual: '手动查询',
      query: '命令查询',
    };

    for (const record of records) {
      const time = formatTime(record.timestamp);
      const fans = formatNumber(record.fansCount);
      const source = sourceMap[record.source] || record.source || '未知';
      lines.push(_buildCSVLine([time, fans, source]));
    }

    const bomContent = lines.join('\r\n');
    writeFileSync(filePath, bomContent, 'utf-8');

    return filePath;
  }

  exportToCSVContent(uid, nickname, records) {
    const lines = [];

    lines.push(_buildCSVLine(['时间', '粉丝数', '数据来源']));

    const sourceMap = {
      scheduled: '定时更新',
      manual: '手动查询',
      query: '命令查询',
    };

    for (const record of records) {
      const time = formatTime(record.timestamp);
      const fans = formatNumber(record.fansCount);
      const source = sourceMap[record.source] || record.source || '未知';
      lines.push(_buildCSVLine([time, fans, source]));
    }

    return lines.join('\n');
  }
}

const csvExporter = new CSVExporter();

export { csvExporter as default, CSVExporter };
