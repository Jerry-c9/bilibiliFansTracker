function formatFansCount(n) {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }

  const num = Number(n);
  if (num >= 100000000) {
    return (num / 100000000).toFixed(1) + '亿';
  }
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString('zh-CN');
}

function formatChange(n) {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }

  const num = Number(n);
  if (num > 0) {
    return '+' + formatFansCount(num);
  }
  if (num < 0) {
    return '-' + formatFansCount(Math.abs(num));
  }
  return '0';
}

function formatChangeDirection(n) {
  if (n === null || n === undefined || isNaN(n)) {
    return '→';
  }

  const num = Number(n);
  if (num > 0) {
    return '📈';
  }
  if (num < 0) {
    return '📉';
  }
  return '→';
}

function formatTime(ts) {
  if (!ts) {
    return '';
  }

  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatTimeShort(ts) {
  if (!ts) {
    return '';
  }

  const date = new Date(ts);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${month}-${day}`;
}

function formatPercentChange(oldCount, newCount) {
  if (!oldCount || oldCount === 0) {
    return '新增';
  }

  const change = newCount - oldCount;
  const percent = ((change / oldCount) * 100);

  if (percent > 0) {
    return '+' + percent.toFixed(2) + '%';
  }
  if (percent < 0) {
    return percent.toFixed(2) + '%';
  }
  return '0%';
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) {
    return '0';
  }
  return Number(n).toLocaleString('zh-CN');
}

function isValidUid(uid) {
  if (!uid) {
    return false;
  }

  const str = String(uid).trim();
  if (!/^\d+$/.test(str)) {
    return false;
  }

  const num = parseInt(str, 10);
  if (num < 1 || num > 9999999999999999) {
    return false;
  }

  return true;
}

function extractUidFromMsg(msg) {
  if (!msg) {
    return null;
  }

  const match = String(msg).match(/(\d+)/);
  if (!match) {
    return null;
  }

  const uid = match[1];
  if (!isValidUid(uid)) {
    return null;
  }

  return uid;
}

function getMilestoneLabel(count) {
  if (count >= 100000000) {
    return '亿';
  }
  if (count >= 10000) {
    return '万';
  }
  return '';
}

function getMilestoneValue(count) {
  if (count >= 100000000) {
    return Math.floor(count / 100000000);
  }
  if (count >= 10000) {
    return Math.floor(count / 10000);
  }
  return count;
}

function extractParamFromMsg(msg) {
  if (!msg) return null;
  // Match the last word-like token after the command
  const parts = String(msg).trim().split(/\s+/);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

export {
  formatFansCount,
  formatChange,
  formatChangeDirection,
  formatTime,
  formatTimeShort,
  formatPercentChange,
  formatNumber,
  isValidUid,
  extractUidFromMsg,
  extractParamFromMsg,
  getMilestoneLabel,
  getMilestoneValue,
};
