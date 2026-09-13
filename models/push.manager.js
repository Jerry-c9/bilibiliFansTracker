import subscriptionManager from './subscription.manager.js';
import historyManager from './history.manager.js';
import chartRenderer from './chart.renderer.js';
import config from '../utils/config.js';
import {
  formatFansCount,
  formatChange,
  formatChangeDirection,
} from '../utils/format.js';

function _detectMilestones(oldCount, newCount, milestones) {
  if (!milestones || milestones.length === 0) {
    return [];
  }

  const sorted = [...milestones].sort((a, b) => a - b);
  const hit = [];

  for (const m of sorted) {
    const threshold = m * 10000;
    if (oldCount < threshold && newCount >= threshold) {
      hit.push(m);
    }
  }

  return hit;
}

function _buildMilestoneMessage(sub, currentFans, milestonesHit) {
  const lines = [];
  lines.push('\uD83C\uDF89 里程碑达成！');
  lines.push('');
  lines.push('UP主：');
  lines.push(sub.nickname || 'UP主' + sub.uid);
  lines.push('');
  lines.push('UID：');
  lines.push(sub.uid);
  lines.push('');
  lines.push('当前粉丝数：');
  lines.push(formatFansCount(currentFans));
  lines.push('');
  lines.push('已突破：');
  for (const m of milestonesHit) {
    lines.push(m + '万粉');
  }
  lines.push('');
  lines.push('恭喜！');
  return lines.join('\n');
}

function _buildPushMessage(sub, currentFans, lastFans, weekAgoRecord, milestonesHit) {
  const lines = [];

  lines.push('\uD83D\uDCCA ' + (sub.nickname || 'UP主' + sub.uid) + ' 粉丝数更新');
  lines.push('');
  lines.push('当前粉丝: ' + formatFansCount(currentFans));

  if (config.get('showLastChange', true) && lastFans !== null && lastFans !== undefined) {
    const change = currentFans - lastFans;
    lines.push('较上次: ' + formatChange(change) + ' ' + formatChangeDirection(change));
  }

  if (config.get('showWeekChange', true) && weekAgoRecord) {
    const weekChange = currentFans - weekAgoRecord.fansCount;
    lines.push('较7天前: ' + formatChange(weekChange) + ' ' + formatChangeDirection(weekChange));
  }

  if (milestonesHit && milestonesHit.length > 0 && config.get('milestoneEnabled', true)) {
    lines.push('');
    for (const m of milestonesHit) {
      lines.push('\uD83C\uDF89 恭喜突破 ' + m + ' 万粉丝！');
    }
  }

  return lines.join('\n');
}

class PushManager {
  _pushDebug(msg) {
    if (!config.get('debug.enabled', false)) return;
    if (typeof logger !== 'undefined' && logger.mark) {
      logger.mark('[BilibiliFansTracker][Push] ' + msg);
    }
  }

  _pushInfo(msg) {
    if (typeof logger !== 'undefined' && logger.info) {
      logger.info('[BilibiliFansTracker][Push] ' + msg);
    }
  }

  _pushWarn(msg) {
    if (typeof logger !== 'undefined' && logger.warn) {
      logger.warn('[BilibiliFansTracker][Push] ' + msg);
    }
  }

  async processGroup(groupId) {
    const uids = subscriptionManager.getSubscribedUids(groupId);

    if (uids.length === 0) {
      return 0;
    }

    const threshold = config.get('mergeForwardThreshold', 3);
    const changedItems = [];

    for (const uid of uids) {
      try {
        const item = await this._preparePushItem(groupId, uid);
        if (item) {
          changedItems.push(item);
        }
      } catch (err) {
        if (typeof logger !== 'undefined' && logger.debug) {
          logger.debug(
            '[BilibiliFansTracker] 推送 UID ' + uid + ' 到群 ' + groupId + ' 失败: ' + err.message
          );
        }
      }
    }

    if (changedItems.length === 0) {
      return 0;
    }

    this._pushDebug('本群订阅: ' + uids.length + ' 变化: ' + changedItems.length);

    if (changedItems.length > threshold) {
      return await this._sendBatchAsForward(groupId, changedItems);
    }

    return await this._sendBatchIndividual(groupId, changedItems);
  }

  async _preparePushItem(groupId, uid) {
    const latestRecord = historyManager.getLatestRecord(uid);

    if (!latestRecord) {
      return null;
    }

    const currentFans = latestRecord.fansCount;

    const sub = subscriptionManager.getSubscription(groupId, uid);

    if (!sub) {
      return null;
    }

    const lastFans = sub.lastFansCount;

    if (lastFans === currentFans) {
      return null;
    }

    const milestones = config.get('milestones', [10, 50, 100, 500, 1000]);
    const milestonesHit = _detectMilestones(lastFans, currentFans, milestones);

    const weekAgoRecord = historyManager.getRecordDaysAgo(uid, 7);

    const textMsg = _buildPushMessage(sub, currentFans, lastFans, weekAgoRecord, milestonesHit);

    // Try to render a chart for the push
    let chartBuffer = null;
    try {
      const records = historyManager.getRecords(uid, 30);
      if (records.length >= 2) {
        chartBuffer = await chartRenderer.renderFansChart(
          uid,
          sub.nickname || 'UP主' + uid,
          records,
          30,
          '',
          '',
          ''
        );
      }
    } catch (err) {
      if (typeof logger !== 'undefined' && logger.debug) {
        logger.debug('[BilibiliFansTracker] 推送图表渲染失败: ' + err.message);
      }
    }

    return { uid, sub, currentFans, textMsg, chartBuffer };
  }

  async _sendBatchIndividual(groupId, changedItems) {
    let sentCount = 0;

    for (const item of changedItems) {
      try {
        const Segment = (await import('../utils/host.js')).Segment;

        if (item.chartBuffer) {
          const base64 = item.chartBuffer.toString('base64');
          const imgSegment = Segment.image('base64://' + base64);
          await this._sendGroupMessage(groupId, [imgSegment, item.textMsg]);
        } else {
          await this._sendGroupMessage(groupId, item.textMsg);
        }

        subscriptionManager.updateLastFansCount(groupId, item.uid, item.currentFans);
        subscriptionManager.updateLastPushedAt(groupId, item.uid, Date.now());

        sentCount++;
      } catch (err) {
        if (typeof logger !== 'undefined' && logger.error) {
          logger.error(
            '[BilibiliFansTracker] 发送群消息失败 [群:' + groupId + ' uid:' + item.uid + ']: ' + err.message
          );
        }
      }
    }

    return sentCount;
  }

  async _sendBatchAsForward(groupId, changedItems) {
    try {
      const messages = [];
      const sentUids = [];

      for (const item of changedItems) {
        if (item.chartBuffer) {
          const Segment = (await import('../utils/host.js')).Segment;
          const base64 = item.chartBuffer.toString('base64');
          const imgSegment = Segment.image('base64://' + base64);

          messages.push({
            user_id: Bot.uin || '80000000',
            nickname: item.sub.nickname || 'UP主' + item.uid,
            message: [imgSegment],
          });
        } else {
          messages.push({
            user_id: Bot.uin || '80000000',
            nickname: item.sub.nickname || 'UP主' + item.uid,
            message: item.textMsg,
          });
        }
        sentUids.push(item.uid);
      }

      if (messages.length > 0) {
        try {
          const forwardMsg = await Bot.makeForwardMsg(messages);

          await this._sendGroupMessage(groupId, forwardMsg);

          // Summary text after forward
          const summary = '\uD83D\uDCCA 今日共有 ' + changedItems.length + ' 位UP发生变化';
          await this._sendGroupMessage(groupId, summary);

          this._pushDebug('采用: 合并转发');
        } catch (forwardErr) {
          this._pushWarn('当前适配器不支持合并转发，自动降级普通发送');
          return await this._sendBatchIndividual(groupId, changedItems);
        }
      }

      // Update subscription state for all sent UIDs
      for (const item of changedItems) {
        try {
          subscriptionManager.updateLastFansCount(groupId, item.uid, item.currentFans);
          subscriptionManager.updateLastPushedAt(groupId, item.uid, Date.now());
        } catch {}
      }

      return changedItems.length;
    } catch (err) {
      this._pushWarn('合并转发失败，降级为逐条发送: ' + (err.message || 'unknown'));
      return await this._sendBatchIndividual(groupId, changedItems);
    }
  }

  async pushMilestone(groupId, uid, currentFans, milestonesHit, nickname, faceUrl, sign) {
    if (!milestonesHit || milestonesHit.length === 0) {
      return false;
    }

    if (!config.get('milestoneEnabled', true)) {
      return false;
    }

    const sub = subscriptionManager.getSubscription(groupId, uid);
    if (!sub) return false;

    // Check which milestones are already reached
    const alreadyReached = sub.milestonesReached || {};
    const newHits = milestonesHit.filter((m) => !alreadyReached[String(m * 10000)]);

    if (newHits.length === 0) {
      return false;
    }

    const textMsg = _buildMilestoneMessage(sub, currentFans, newHits);

    // Try chart first
    let chartBuffer = null;
    try {
      const records = historyManager.getRecords(uid, 30);
      if (records.length >= 2) {
        const milestoneLabel = newHits.map((m) => m + '万').join('/');
        const milestoneTitle = '\uD83C\uDF89 达成' + milestoneLabel + '粉里程碑';
        chartBuffer = await chartRenderer.renderFansChart(
          uid,
          nickname || sub.nickname || 'UP主' + uid,
          records,
          30,
          faceUrl || '',
          sign || '',
          milestoneTitle
        );
      }
    } catch (err) {
      if (typeof logger !== 'undefined' && logger.debug) {
        logger.debug('[BilibiliFansTracker] 里程碑图表渲染失败: ' + err.message);
      }
    }

    try {
      if (chartBuffer) {
        const Segment = (await import('../utils/host.js')).Segment;
        const base64 = chartBuffer.toString('base64');
        const imgSegment = Segment.image('base64://' + base64);
        await this._sendGroupMessage(groupId, [textMsg, imgSegment]);
      } else {
        await this._sendGroupMessage(groupId, textMsg);
      }
    } catch (err) {
      if (typeof logger !== 'undefined' && logger.error) {
        logger.error('[BilibiliFansTracker] 里程碑推送失败 [群:' + groupId + ']: ' + err.message);
      }
      return false;
    }

    // Mark milestones as reached
    for (const m of newHits) {
      subscriptionManager.markMilestoneReached(groupId, uid, m * 10000);
    }

    return true;
  }

  async pushNicknameChanged(groupId, uid, oldNickname, newNickname) {
    const message = [
      '\uD83D\uDCDD UP主昵称变更',
      '',
      'UID：',
      uid,
      '',
      '旧昵称：',
      oldNickname,
      '',
      '新昵称：',
      newNickname,
    ].join('\n');

    try {
      await this._sendGroupMessage(groupId, message);
      return true;
    } catch (err) {
      if (typeof logger !== 'undefined' && logger.error) {
        logger.error('[BilibiliFansTracker] 昵称变更推送失败 [群:' + groupId + ']: ' + err.message);
      }
      return false;
    }
  }

  async _sendGroupMessage(groupId, message) {
    try {
      if (typeof Bot !== 'undefined' && Bot.pickGroup) {
        const group = Bot.pickGroup(groupId);
        if (group && group.sendMsg) {
          await group.sendMsg(message);
          return;
        }
      }

      if (typeof Bot !== 'undefined' && Bot.sendGroupMsg) {
        await Bot.sendGroupMsg(groupId, message);
        return;
      }

      if (typeof logger !== 'undefined' && logger.warn) {
        logger.warn('[BilibiliFansTracker] 无法发送群消息: Bot 接口不可用');
      }
    } catch (err) {
      throw err;
    }
  }
}

const pushManager = new PushManager();

export { pushManager as default, PushManager };
