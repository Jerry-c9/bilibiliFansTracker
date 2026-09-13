import { _paths } from './paths.js';
import { readFileSync } from 'fs';
import { join } from 'path';

let _adapterType = null;

function detectAdapter() {
  if (_adapterType !== null) {
    return _adapterType;
  }

  try {
    const pkgPath = join(_paths.root, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const name = pkg.name || '';

    if (name === 'trss-yunzai') {
      _adapterType = 'trss';
    } else if (name === 'miao-yunzai') {
      _adapterType = 'miao';
    } else if (name === 'yunzai-pe' || name === 'yunzai-core') {
      _adapterType = 'yunzaijs';
    } else {
      _adapterType = 'other';
    }
  } catch {
    _adapterType = 'other';
  }

  return _adapterType;
}

function detectBotAdapter(e) {
  if (!e || !e.adapter) {
    return 'unknown';
  }

  const adapterName = (e.adapter?.name || e.adapter?.constructor?.name || '').toLowerCase();

  if (adapterName.includes('qqbot') || adapterName.includes('qqguild')) {
    return 'QQBot';
  }

  if (adapterName.includes('napcat') || adapterName.includes('onebot') || adapterName.includes('icqq') || adapterName.includes('oicq')) {
    return 'Napcat';
  }

  if (e.bot?.uin || e.bot?.qq) {
    return 'Napcat';
  }

  if (e.isQQBot || e.isGuild) {
    return 'QQBot';
  }

  return 'unknown';
}

function isQQBot(e) {
  return detectBotAdapter(e) === 'QQBot';
}

function isNapcat(e) {
  return detectBotAdapter(e) === 'Napcat';
}

export { detectAdapter, detectBotAdapter, isQQBot, isNapcat };
