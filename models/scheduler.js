import schedule from 'node-schedule';
import config from '../utils/config.js';
import subscriptionManager from './subscription.manager.js';
import historyManager from './history.manager.js';
import bilibiliAPI from './bilibili.api.js';
import pushManager from './push.manager.js';

function _schedLog(msg) {
  if (typeof logger !== 'undefined' && logger.mark) {
    logger.mark('[BilibiliFansTracker][Scheduler] ' + msg);
  }
}

function _schedInfo(msg) {
  if (typeof logger !== 'undefined' && logger.info) {
    logger.info('[BilibiliFansTracker][Scheduler] ' + msg);
  }
}

function _schedWarn(msg) {
  if (typeof logger !== 'undefined' && logger.warn) {
    logger.warn('[BilibiliFansTracker][Scheduler] ' + msg);
  }
}

function _schedError(msg) {
  if (typeof logger !== 'undefined' && logger.error) {
    logger.error('[BilibiliFansTracker][Scheduler] ' + msg);
  }
}

class Scheduler {
  constructor() {
    this._jobs = {};
    this._updateRunning = false;
    this._pushRunning = false;
    this._cleanupRunning = false;
  }

  start() {
    if (!config.get('enabled', true)) {
      _schedWarn('插件已禁用，跳过定时任务启动');
      return;
    }

    const updateCron = config.get('updateCron', '0 0 8 * * *');
    const pushCron = config.get('pushCron', '0 5 8 * * *');
    const cleanupCron = config.get('cleanupCron', '0 0 4 * * *');

    _schedInfo('updateCron = ' + updateCron);
    _schedInfo('pushCron = ' + pushCron);
    _schedInfo('cleanupCron = ' + cleanupCron);

    try {
      this._schedule('update', updateCron, () => this._runUpdateTask());
      _schedInfo('更新任务已注册');
    } catch (err) {
      _schedError('更新任务注册失败: ' + err.message);
    }

    try {
      this._schedule('push', pushCron, () => this._runPushTask());
      _schedInfo('推送任务已注册');
    } catch (err) {
      _schedError('推送任务注册失败: ' + err.message);
    }

    try {
      this._schedule('cleanup', cleanupCron, () => this._runCleanupTask());
      _schedInfo('清理任务已注册');
    } catch (err) {
      _schedError('清理任务注册失败: ' + err.message);
    }

    _schedInfo('定时任务已启动');
  }

  _schedule(name, cron, fn) {
    if (this._jobs[name]) {
      this._jobs[name].cancel();
    }
    this._jobs[name] = schedule.scheduleJob(cron, async (fireTime) => {
      _schedLog('定时任务触发: ' + name + ' @ ' + fireTime);
      try {
        await fn();
      } catch (err) {
        _schedError('定时任务异常 [' + name + ']: ' + err.message);
      }
    });
  }

  stop() {
    for (const name of Object.keys(this._jobs)) {
      try { this._jobs[name].cancel(); } catch {}
      delete this._jobs[name];
    }
    _schedInfo('定时任务已停止');
  }

  restart() {
    this.stop();
    this.start();
  }

  async _runUpdateTask() {
    if (!config.get('enabled', true)) {
      _schedWarn('插件已禁用，跳过更新任务');
      return;
    }
    if (this._updateRunning) {
      _schedWarn('更新任务正在运行，跳过本次执行');
      return;
    }

    this._updateRunning = true;
    _schedLog('开始更新任务');
    const startTime = Date.now();

    try {
      const uniqueUids = subscriptionManager.getAllUniqueUids();
      if (uniqueUids.length === 0) {
        _schedWarn('无订阅UID，跳过更新');
        return;
      }


      let successCount = 0;
      let failCount = 0;
      let historyCount = 0;
      const failedUids = [];

      for (const uid of uniqueUids) {
        try {
          const result = await bilibiliAPI.getFansCountAndNickname(uid);

          const oldRecord = historyManager.getLatestRecord(uid);
          const oldFans = oldRecord ? oldRecord.fansCount : 0;

          // Always write history — even if fans count unchanged
          historyManager.addRecord(uid, result.follower, 'scheduled');
          historyCount++;

          const groups = subscriptionManager.getGroupsForUid(uid);
          for (const groupId of groups) {
            if (result.nickname) {
              const sub = subscriptionManager.getSubscription(groupId, uid);
              const oldNickname = sub ? sub.nickname : '';
              if (oldNickname && oldNickname !== result.nickname) {
                _schedLog('UID ' + uid + ' 昵称变更: ' + oldNickname + ' -> ' + result.nickname);
                try {
                  await pushManager.pushNicknameChanged(
                    groupId, uid, oldNickname, result.nickname
                  );
                } catch (err) {
                  _schedError('昵称变更推送失败 [群:' + groupId + ']: ' + err.message);
                }
              }
              subscriptionManager.updateNickname(groupId, uid, result.nickname);
            }
          }

          // Check milestone immediately
          if (config.get('milestoneEnabled', true) && oldFans > 0) {
            const milestones = config.get('milestones', [10, 50, 100, 500, 1000]);
            const sorted = [...milestones].sort((a, b) => a - b);
            const hit = [];
            for (const m of sorted) {
              const threshold = m * 10000;
              if (oldFans < threshold && result.follower >= threshold) {
                hit.push(m);
              }
            }

            if (hit.length > 0) {
              _schedLog('UID ' + uid + ' 检测到里程碑: ' + hit.join(', ') + '万');
              for (const groupId of groups) {
                try {
                  await pushManager.pushMilestone(
                    groupId,
                    uid,
                    result.follower,
                    hit,
                    result.nickname,
                    result.face || '',
                    result.sign || ''
                  );
                } catch (err) {
                  _schedError('里程碑推送失败 [群:' + groupId + ' uid:' + uid + ']: ' + err.message);
                }
              }
            }
          }

          successCount++;
          await this._delay(1000 + Math.random() * 2000);
        } catch (err) {
          failCount++;
          failedUids.push({ uid: uid, err: err.message || 'unknown' });
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const summaryParts = ['更新完成: 成功 ' + successCount + ' 个'];
      if (failCount > 0) {
        const failedNames = failedUids.map(f => {
          const groups = subscriptionManager.getGroupsForUid(f.uid);
          if (groups.length > 0) {
            const sub = subscriptionManager.getSubscription(groups[0], f.uid);
            return (sub && sub.nickname) ? sub.nickname + ' (UID:' + f.uid + ')' : 'UID:' + f.uid;
          }
          return 'UID:' + f.uid;
        });
        summaryParts.push('失败 ' + failCount + ' 个: ' + failedNames.join(', '));
      }
      summaryParts.push('耗时 ' + elapsed + '秒');
      _schedInfo(summaryParts.join(' | '));
    } finally {
      this._updateRunning = false;
      _schedLog('更新任务结束');
    }
  }

  async _runPushTask() {
    if (!config.get('enabled', true)) {
      _schedWarn('插件已禁用，跳过推送任务');
      return;
    }
    if (this._pushRunning) {
      _schedWarn('推送任务正在运行，跳过本次执行');
      return;
    }

    this._pushRunning = true;
    _schedLog('开始推送任务');

    try {
      const groupIds = subscriptionManager.getAllGroupIds();
      if (groupIds.length === 0) {
        _schedWarn('无订阅群组，跳过推送');
        return;
      }

      let pushCount = 0;
      for (const groupId of groupIds) {
        try {
          const sent = await pushManager.processGroup(groupId);
          pushCount += sent;
        } catch (err) {
          _schedError('推送群 ' + groupId + ' 失败: ' + err.message);
        }
      }

      _schedInfo('推送完成: 共推送 ' + pushCount + ' 条消息');
    } finally {
      this._pushRunning = false;
      _schedLog('推送任务结束');
    }
  }

  async _runCleanupTask() {
    if (this._cleanupRunning) {
      _schedWarn('清理任务正在运行，跳过本次执行');
      return;
    }
    this._cleanupRunning = true;
    _schedLog('开始清理任务');

    try {
      // Step 1: Retention cleanup (delete records beyond retention days)
      const removed = historyManager.cleanup();
      _schedInfo('历史数据保留清理完成，清理了 ' + removed + ' 条记录');

      // Step 2: Compaction (downsample old records via min-max aggregation)
      _schedLog('开始历史数据归档压缩');
      await historyManager.compactAllHistory();
    } finally {
      this._cleanupRunning = false;
      _schedLog('清理任务结束');
    }
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const scheduler = new Scheduler();

export { scheduler as default, Scheduler };
