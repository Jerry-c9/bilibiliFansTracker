import { readFileSync, existsSync } from 'fs';
import { watch } from 'chokidar';
import YAML from 'yaml';
import lodash from 'lodash';
import { join, dirname } from 'path';
import { _paths } from './paths.js';
import { ensureDir, atomicWriteFileSync } from './storage.js';

const DEFAULT_CONFIG = {
  enabled: true,
  maxSubscriptionsPerGroup: 100,
  updateCron: '0 0 8 * * *',
  pushCron: '0 5 8 * * *',
  historyRetentionDays: 365,
  cleanupCron: '0 0 4 * * *',
  mergeForwardThreshold: 3,
  defaultChartRange: 30,
  milestoneEnabled: true,
  milestones: [10, 50, 100, 500, 1000],
  apiTimeout: 10000,
  apiRetryCount: 3,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  // 可选的 B 站 Cookie（留空表示匿名请求）。含敏感凭据，切勿提交到仓库。
  cookie: '',
  showLastChange: true,
  showWeekChange: true,
  debug: {
    enabled: false,
  },
  debugKeepHtml: false,
};

class Config {
  constructor() {
    this._config = null;
    this._watcher = null;
    this._guobaConfig = null;
    this._guobaWatcher = null;
    this._initConfigFile();
    this._load();
    this._watch();
  }

  _initConfigFile() {
    const configDir = dirname(_paths.configFile);
    ensureDir(configDir);

    if (!existsSync(_paths.configFile)) {
      atomicWriteFileSync(_paths.configFile, YAML.stringify(DEFAULT_CONFIG));
    }
  }

  _getGuobaConfigPath() {
    return join(_paths.pluginData, 'guoba.config.yaml');
  }

  _loadGuobaConfig() {
    try {
      const guobaPath = this._getGuobaConfigPath();
      if (!existsSync(guobaPath)) {
        return null;
      }
      const raw = readFileSync(guobaPath, 'utf-8');
      const data = YAML.parse(raw) || {};
      return data;
    } catch {
      return null;
    }
  }

  _load() {
    // Step 1: Load default.yaml
    try {
      const raw = readFileSync(_paths.configFile, 'utf-8');
      const userConfig = YAML.parse(raw) || {};
      this._config = lodash.merge({}, DEFAULT_CONFIG, userConfig);
    } catch (err) {
      this._config = lodash.cloneDeep(DEFAULT_CONFIG);
      if (typeof logger !== 'undefined' && logger.error) {
        logger.error(
          '[BilibiliFansTracker][Config] 读取 default.yaml 失败，已回退到默认配置: ' +
          (err.message || 'unknown')
        );
      }
    }

    // Step 2: Merge guoba.config.yaml (higher priority)
    const guobaConfig = this._loadGuobaConfig();
    if (guobaConfig) {
      this._config = lodash.merge({}, this._config, guobaConfig);
      if (typeof logger !== 'undefined' && logger.mark) {
        logger.mark('[BilibiliFansTracker][Config] 读取 guoba.config.yaml 成功');
        logger.mark('[BilibiliFansTracker][Config] updateCron = ' + this._config.updateCron);
        logger.mark('[BilibiliFansTracker][Config] pushCron = ' + this._config.pushCron);
        logger.mark('[BilibiliFansTracker][Config] cleanupCron = ' + this._config.cleanupCron);
      }
    } else {
      if (typeof logger !== 'undefined' && logger.mark) {
        logger.mark('[BilibiliFansTracker][Config] 未找到 guoba.config.yaml，使用 default.yaml');
        logger.mark('[BilibiliFansTracker][Config] updateCron = ' + this._config.updateCron);
        logger.mark('[BilibiliFansTracker][Config] pushCron = ' + this._config.pushCron);
        logger.mark('[BilibiliFansTracker][Config] cleanupCron = ' + this._config.cleanupCron);
      }
    }
  }

  _watch() {
    if (this._watcher) {
      this._watcher.close();
    }
    this._watcher = watch(_paths.configFile, { persistent: true });
    this._watcher.on('change', () => {
      this._load();
      if (typeof logger !== 'undefined' && logger.mark) {
        logger.mark('[BilibiliFansTracker] 配置文件已更新，已重新加载');
      }
    });
  }

  get(key, defaultValue) {
    if (!this._config) {
      this._load();
    }
    const value = lodash.get(this._config, key);
    return value !== undefined ? value : defaultValue;
  }

  getAll() {
    if (!this._config) {
      this._load();
    }
    return lodash.cloneDeep(this._config);
  }

  set(key, value) {
    if (!this._config) {
      this._load();
    }
    lodash.set(this._config, key, value);
    try {
      atomicWriteFileSync(_paths.configFile, YAML.stringify(this._config));
    } catch (err) {
      if (typeof logger !== 'undefined' && logger.error) {
        logger.error(`[BilibiliFansTracker] 保存配置失败: ${err.message}`);
      }
    }
  }

  mergeFromGuoba(data) {
    if (!data || typeof data !== 'object') {
      return;
    }
    this._guobaConfig = lodash.cloneDeep(data);
    this._config = lodash.merge({}, DEFAULT_CONFIG, this._guobaConfig);
  }

  destroy() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._guobaWatcher) {
      this._guobaWatcher.close();
      this._guobaWatcher = null;
    }
  }
}

const config = new Config();

export { config as default, Config, DEFAULT_CONFIG };
