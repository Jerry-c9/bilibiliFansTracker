import { isQQBot, isNapcat } from './adapter.js';

function isGroupChat(e) {
  if (!e) {
    return false;
  }
  if (e.isGroup === true) {
    return true;
  }
  if (e.message_type === 'group') {
    return true;
  }
  if (e.group_id && !e.guild_id) {
    return true;
  }
  return false;
}

function isPrivateChat(e) {
  return !isGroupChat(e);
}

function isMaster(e) {
  if (!e) {
    return false;
  }
  if (e.isMaster === true) {
    return true;
  }
  if (typeof e.isMaster === 'function') {
    return e.isMaster();
  }
  return false;
}

function isGroupOwner(e) {
  if (!e || !isGroupChat(e)) {
    return false;
  }
  try {
    const role = e.member?.role || e.sender?.role || '';
    if (role === 'owner') {
      return true;
    }
    if (e.sender?.role === 'owner') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function isGroupAdmin(e) {
  if (!e || !isGroupChat(e)) {
    return false;
  }
  try {
    const role = e.member?.role || e.sender?.role || '';
    if (role === 'admin' || role === 'owner') {
      return true;
    }
    if (e.sender?.role === 'admin' || e.sender?.role === 'owner') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function checkSubscribePermission(e) {
  if (!isGroupChat(e)) {
    return { allowed: false, reason: '仅支持群聊使用此命令哦~' };
  }

  if (isMaster(e)) {
    return { allowed: true, reason: '' };
  }

  if (isQQBot(e)) {
    return { allowed: false, reason: 'QQ官方Bot仅允许主人操作~' };
  }

  if (isNapcat(e)) {
    if (isGroupOwner(e) || isGroupAdmin(e)) {
      return { allowed: true, reason: '' };
    }
    return { allowed: false, reason: '仅群主或管理员可以操作订阅~' };
  }

  if (isGroupOwner(e) || isGroupAdmin(e)) {
    return { allowed: true, reason: '' };
  }

  return { allowed: false, reason: '权限不足~' };
}

function checkUnsubscribePermission(e) {
  return checkSubscribePermission(e);
}

export {
  isGroupChat,
  isPrivateChat,
  isMaster,
  isGroupOwner,
  isGroupAdmin,
  checkSubscribePermission,
  checkUnsubscribePermission,
};
