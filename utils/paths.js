import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const _path = process.cwd();
const thisFilePath = dirname(fileURLToPath(import.meta.url));
const pluginPath = join(thisFilePath, '..');
const pluginName = basename(pluginPath);

const _paths = {
  root: _path,
  botData: join(_path, 'data'),
  botTempPath: join(_path, 'temp'),
  pluginPath,
  pluginName,
  pluginResources: join(pluginPath, 'resources'),
  pluginConfig: join(pluginPath, 'config'),
  pluginData: join(pluginPath, 'data'),
  configFile: join(pluginPath, 'config', 'default.yaml'),
  subscriptionsFile: join(pluginPath, 'data', 'subscriptions.json'),
  historyDir: join(pluginPath, 'data', 'history'),
  nicknameCacheFile: join(pluginPath, 'data', 'nickname_cache.json'),
  chartTemplate: join(pluginPath, 'resources', 'chart_template.html'),
  exportDir: join(pluginPath, 'data', 'exports'),
  debugDir: join(pluginPath, 'data', 'debug'),
  debugHtmlDir: join(pluginPath, 'data', 'debug', 'html'),
  debugImageDir: join(pluginPath, 'data', 'debug', 'images'),
  cacheDir: join(pluginPath, 'data', 'cache'),
  userCacheDir: join(pluginPath, 'data', 'cache', 'user'),
  avatarCacheDir: join(pluginPath, 'data', 'cache', 'avatar'),
};

export { _paths, pluginName };
