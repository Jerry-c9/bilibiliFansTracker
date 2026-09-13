import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { dirname } from 'path';

/**
 * 确保目录存在
 * @param {string} dir
 */
function ensureDir(dir) {
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 原子写入文件：先写入临时文件再重命名，避免进程中断导致文件被写坏。
 * @param {string} filePath
 * @param {string|Buffer} data
 */
function atomicWriteFileSync(filePath, data) {
  ensureDir(dirname(filePath));
  const tmpPath = filePath + '.tmp';
  writeFileSync(tmpPath, data);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

/**
 * 将损坏的文件隔离为 .corrupt-<时间戳>，等待人工检查，避免静默丢数据。
 * @param {string} filePath
 * @returns {string|null} 备份文件路径
 */
function quarantineCorruptFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.corrupt-${stamp}`;
    renameSync(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

export { ensureDir, atomicWriteFileSync, quarantineCorruptFile };
