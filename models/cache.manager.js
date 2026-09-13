import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { _paths } from '../utils/paths.js';
import config from '../utils/config.js';

const USER_CACHE_TTL = 12 * 60 * 60 * 1000;  // 12 hours
const AVATAR_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;  // 7 days

function _isDebug() {
  return config.get('debug.enabled', false);
}

function _debugLog(msg) {
  if (!_isDebug()) return;
  if (typeof logger !== 'undefined' && logger.mark) {
    logger.mark('[BilibiliFansTracker][Cache] ' + msg);
  }
}

function _ensureDir(p) {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

// ── 用户信息缓存 ───────────────────────────────────────

function _getUserCachePath(uid) {
  return join(_paths.userCacheDir, `${uid}.json`);
}

function _readUserCache(uid) {
  try {
    const filePath = _getUserCachePath(uid);
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.cachedAt && (Date.now() - data.cachedAt) > USER_CACHE_TTL) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function _writeUserCache(uid, data) {
  try {
    _ensureDir(_paths.userCacheDir);
    const filePath = _getUserCachePath(uid);
    const cacheData = {
      uid: String(uid),
      nickname: data.nickname || '',
      face: data.face || '',
      sign: data.sign || '',
      cachedAt: Date.now(),
    };
    writeFileSync(filePath, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch {
    // non-critical
  }
}

// ── 头像文件缓存 ───────────────────────────────────────

function _getAvatarPath(uid) {
  return join(_paths.avatarCacheDir, `${uid}.jpg`);
}

function _isAvatarValid(uid) {
  try {
    const filePath = _getAvatarPath(uid);
    if (!existsSync(filePath)) return false;
    const stats = statSync(filePath);
    if ((Date.now() - stats.mtimeMs) > AVATAR_CACHE_TTL) {
      return false;
    }
    if (stats.size === 0) return false;
    return true;
  } catch {
    return false;
  }
}

function _saveAvatarFile(uid, buffer) {
  try {
    _ensureDir(_paths.avatarCacheDir);
    const filePath = _getAvatarPath(uid);
    writeFileSync(filePath, buffer);
    return true;
  } catch {
    return false;
  }
}

function _readAvatarBase64(uid) {
  try {
    const filePath = _getAvatarPath(uid);
    if (!existsSync(filePath)) return '';
    const buffer = readFileSync(filePath);
    if (buffer.length === 0) return '';
    const base64 = buffer.toString('base64');
    return 'data:image/jpeg;base64,' + base64;
  } catch {
    return '';
  }
}

// ── CacheManager ────────────────────────────────────────

class CacheManager {
  /**
   * 获取缓存的用户信息（nickname, face, sign）
   * 返回 null 表示缓存未命中
   */
  getUserInfo(uid) {
    const cache = _readUserCache(uid);
    if (cache) {
      _debugLog('用户缓存命中 uid=' + uid);
      return {
        nickname: cache.nickname,
        face: cache.face,
        sign: cache.sign,
      };
    }
    return null;
  }

  /**
   * 写入用户信息缓存
   */
  setUserInfo(uid, data) {
    _writeUserCache(uid, data);
    _debugLog('用户缓存已刷新 uid=' + uid);
  }

  /**
   * 获取头像 Base64（优先本地缓存）
   * 返回 { base64: string, fromCache: boolean }
   */
  getAvatarBase64(uid) {
    if (_isAvatarValid(uid)) {
      const base64 = _readAvatarBase64(uid);
      if (base64) {
        _debugLog('头像缓存命中 uid=' + uid);
        return { base64, fromCache: true };
      }
    }
    return { base64: '', fromCache: false };
  }

  /**
   * 保存头像文件到本地缓存
   */
  saveAvatar(uid, buffer) {
    const ok = _saveAvatarFile(uid, buffer);
    if (ok) {
      _debugLog('头像已缓存 uid=' + uid);
    }
    return ok;
  }

  /**
   * 强制读取本地头像（不检查过期，降级时使用）
   */
  readAvatarForce(uid) {
    return _readAvatarBase64(uid);
  }
}

const cacheManager = new CacheManager();

export { cacheManager as default, CacheManager };
