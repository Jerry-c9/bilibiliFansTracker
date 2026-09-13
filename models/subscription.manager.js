import { readFileSync, existsSync } from 'fs';
import { _paths } from '../utils/paths.js';
import config from '../utils/config.js';
import { atomicWriteFileSync, quarantineCorruptFile } from '../utils/storage.js';

const FILE_VERSION = 1;

function _emptyData() {
  return {
    version: FILE_VERSION,
    groups: {},
  };
}

function _readData() {
  if (!existsSync(_paths.subscriptionsFile)) {
    return _emptyData();
  }

  let raw;
  try {
    raw = readFileSync(_paths.subscriptionsFile, 'utf-8');
  } catch {
    return _emptyData();
  }

  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      throw new Error('订阅数据格式不正确');
    }
    if (!data.groups || typeof data.groups !== 'object') {
      data.groups = {};
    }
    data.version = FILE_VERSION;
    return data;
  } catch (err) {
    const backup = quarantineCorruptFile(_paths.subscriptionsFile);
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(
        '[BilibiliFansTracker] 订阅数据文件损坏，已隔离' +
        (backup ? '到 ' + backup : '') + ': ' + (err.message || 'unknown')
      );
    }
    return _emptyData();
  }
}

function _writeData(data) {
  atomicWriteFileSync(
    _paths.subscriptionsFile,
    JSON.stringify(data, null, 2)
  );
}

function _ensureGroup(data, groupId) {
  const key = String(groupId);
  if (!data.groups[key]) {
    data.groups[key] = {};
  }
  return data.groups[key];
}

class SubscriptionManager {
  subscribe(groupId, uid, nickname, fansCount) {
    const data = _readData();
    const group = _ensureGroup(data, groupId);
    const uidKey = String(uid);

    const now = Date.now();
    group[uidKey] = {
      uid: uidKey,
      nickname: nickname || '',
      subscribedAt: now,
      lastFansCount: fansCount || 0,
      lastCheckedAt: now,
      lastPushedAt: 0,
    };

    _writeData(data);
  }

  unsubscribe(groupId, uid) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey]) {
      return false;
    }

    if (!data.groups[groupKey][uidKey]) {
      return false;
    }

    delete data.groups[groupKey][uidKey];

    if (Object.keys(data.groups[groupKey]).length === 0) {
      delete data.groups[groupKey];
    }

    _writeData(data);
    return true;
  }

  getGroupSubscriptions(groupId) {
    const data = _readData();
    const groupKey = String(groupId);

    if (!data.groups[groupKey]) {
      return [];
    }

    return Object.values(data.groups[groupKey]);
  }

  isSubscribed(groupId, uid) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey]) {
      return false;
    }

    return !!data.groups[groupKey][uidKey];
  }

  getSubscribedUids(groupId) {
    const data = _readData();
    const groupKey = String(groupId);

    if (!data.groups[groupKey]) {
      return [];
    }

    return Object.keys(data.groups[groupKey]);
  }

  getCount(groupId) {
    const data = _readData();
    const groupKey = String(groupId);

    if (!data.groups[groupKey]) {
      return 0;
    }

    return Object.keys(data.groups[groupKey]).length;
  }

  getAllGroupIds() {
    const data = _readData();
    return Object.keys(data.groups);
  }

  getAllUniqueUids() {
    const data = _readData();
    const uidSet = new Set();

    for (const groupKey of Object.keys(data.groups)) {
      for (const uidKey of Object.keys(data.groups[groupKey])) {
        uidSet.add(uidKey);
      }
    }

    return Array.from(uidSet);
  }

  getGroupsForUid(uid) {
    const data = _readData();
    const uidKey = String(uid);
    const groups = [];

    for (const groupKey of Object.keys(data.groups)) {
      if (data.groups[groupKey][uidKey]) {
        groups.push(groupKey);
      }
    }

    return groups;
  }

  updateLastFansCount(groupId, uid, count) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey] || !data.groups[groupKey][uidKey]) {
      return false;
    }

    data.groups[groupKey][uidKey].lastFansCount = count;
    data.groups[groupKey][uidKey].lastCheckedAt = Date.now();
    _writeData(data);
    return true;
  }

  updateNickname(groupId, uid, nickname) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey] || !data.groups[groupKey][uidKey]) {
      return false;
    }

    data.groups[groupKey][uidKey].nickname = nickname;
    _writeData(data);
    return true;
  }

  updateLastPushedAt(groupId, uid, timestamp) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey] || !data.groups[groupKey][uidKey]) {
      return false;
    }

    data.groups[groupKey][uidKey].lastPushedAt = timestamp || Date.now();
    _writeData(data);
    return true;
  }

  getSubscription(groupId, uid) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey] || !data.groups[groupKey][uidKey]) {
      return null;
    }

    return { ...data.groups[groupKey][uidKey] };
  }

  isAtLimit(groupId) {
    const maxCount = config.get('maxSubscriptionsPerGroup', 100);
    return this.getCount(groupId) >= maxCount;
  }

  markMilestoneReached(groupId, uid, threshold) {
    const data = _readData();
    const groupKey = String(groupId);
    const uidKey = String(uid);

    if (!data.groups[groupKey] || !data.groups[groupKey][uidKey]) {
      return false;
    }

    if (!data.groups[groupKey][uidKey].milestonesReached) {
      data.groups[groupKey][uidKey].milestonesReached = {};
    }

    data.groups[groupKey][uidKey].milestonesReached[String(threshold)] = true;
    _writeData(data);
    return true;
  }

  getTotalCount() {
    const data = _readData();
    let total = 0;

    for (const groupKey of Object.keys(data.groups)) {
      total += Object.keys(data.groups[groupKey]).length;
    }

    return total;
  }
}

const subscriptionManager = new SubscriptionManager();

export { subscriptionManager as default, SubscriptionManager };
