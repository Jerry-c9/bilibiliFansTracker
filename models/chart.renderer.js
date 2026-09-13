import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { _paths } from '../utils/paths.js';
import config from '../utils/config.js';
import axios from 'axios';
import cacheManager from './cache.manager.js';
import { downsampleRecords } from '../utils/lttb.js';

const TEMP_DIR = join(_paths.pluginData, 'temp');
const ECHARTS_PATH = join(
  _paths.pluginPath,
  'node_modules',
  'echarts',
  'dist',
  'echarts.min.js'
);


const MAX_RENDER_POINTS = 1000;
function _isDebug() {
  return config.get('debug.enabled', false);
}

function _ensureDir(p) {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

function _ensureTempDir() {
  _ensureDir(TEMP_DIR);
}

function _debugLog(msg) {
  if (!_isDebug()) return;
  if (typeof logger !== 'undefined' && logger.mark) {
    logger.mark('[BilibiliFansTracker][Debug] ' + msg);
  }
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _truncateSign(sign) {
  if (!sign) return '';
  const cleaned = sign.replace(/\n/g, ' ').replace(/\r/g, '').trim();
  if (cleaned.length > 80) {
    return cleaned.slice(0, 80) + '...';
  }
  return cleaned;
}

async function _downloadAvatarAsBase64(faceUrl, uid) {
  if (!faceUrl) {
    _debugLog('头像URL为空，跳过下载');
    return '';
  }

  // Check local cache first
  const cached = cacheManager.getAvatarBase64(uid);
  if (cached.fromCache && cached.base64) {
    return cached.base64;
  }

  // Download from network
  try {
    const response = await axios.get(faceUrl, {
      responseType: 'arraybuffer',
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
    });
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString('base64');

    // Save to cache
    cacheManager.saveAvatar(uid, buffer);

    _debugLog('头像下载成功');
    return 'data:' + contentType + ';base64,' + base64;
  } catch (err) {
    _debugLog('头像下载失败: ' + (err.message || 'unknown'));

    // Fallback: try old cache even if expired
    const fallback = cacheManager.readAvatarForce(uid);
    if (fallback) {
      _debugLog('头像下载失败，使用旧缓存');
      return fallback;
    }
    return '';
  }
}

function _calcYAxis(fansCounts) {
  const dataMin = Math.min(...fansCounts);
  const dataMax = Math.max(...fansCounts);
  const range = dataMax - dataMin;
  const avg = fansCounts.reduce((a, b) => a + b, 0) / fansCounts.length;

  _debugLog('_calcYAxis: dataMin=' + dataMin + ' dataMax=' + dataMax + ' range=' + range + ' avg=' + avg.toFixed(2));

  if (range === 0) {
    const expansion = Math.max(5, Math.ceil(avg * 0.01));
    const step = Math.max(1, Math.ceil(expansion / 5));
    const yMin = avg - expansion;
    const yMax = avg + expansion;
    _debugLog('_calcYAxis: mode=highPrecision(flat) yMin=' + yMin + ' yMax=' + yMax + ' interval=' + step);
    return { mode: 'highPrecision', yMin, yMax, interval: step };
  }

  const fluctuationRatio = range / avg;

  if (fluctuationRatio < 0.01) {
    let step;
    if (range <= 10) step = 1;
    else if (range <= 50) step = 5;
    else if (range <= 100) step = 10;
    else if (range <= 500) step = 50;
    else if (range <= 1000) step = 100;
    else if (range <= 5000) step = 500;
    else if (range <= 10000) step = 1000;
    else step = 2000;

    const padding = Math.max(step, Math.ceil(range * 0.15 / step) * step);
    const yMin = Math.max(0, Math.floor((dataMin - padding) / step) * step);
    const yMax = Math.ceil((dataMax + padding) / step) * step;

    _debugLog('_calcYAxis: mode=highPrecision yMin=' + yMin + ' yMax=' + yMax + ' interval=' + step);
    return { mode: 'highPrecision', yMin, yMax, interval: step };
  }

  let step;
  if (range <= 10) step = 1;
  else if (range <= 50) step = 5;
  else if (range <= 500) step = 10;
  else if (range <= 5000) step = 100;
  else if (range <= 50000) step = 1000;
  else if (range <= 500000) step = 10000;
  else step = 100000;

  const yMin = Math.floor(dataMin / step) * step;
  const yMax = Math.ceil(dataMax / step) * step;

  _debugLog('_calcYAxis: mode=normal yMin=' + yMin + ' yMax=' + yMax + ' interval=' + step);
  return { mode: 'normal', yMin, yMax, interval: step };
}

function _calcDataSpan(records) {
  if (records.length < 2) return 0;
  const first = records[0].timestamp;
  const last = records[records.length - 1].timestamp;
  return last - first;
}

function _buildSubtitle(records) {
  if (records.length < 2) return '';

  const first = records[0].fansCount;
  const last = records[records.length - 1].fansCount;
  const change = last - first;
  const percent = first !== 0 ? ((change / first) * 100) : 0;

  const sign = change >= 0 ? '+' : '';
  const pctStr = (percent >= 0 ? '+' : '') + percent.toFixed(2) + '%';

  const spanMs = _calcDataSpan(records);
  const days = spanMs / (1000 * 60 * 60 * 24);
  const dailyAvg = days > 0 ? (change / days) : 0;
  const dailySign = dailyAvg >= 0 ? '+' : '';

  return '当前粉丝: ' + last.toLocaleString() +
    '  |  区间变化: ' + sign + change.toLocaleString() +
    ' (' + pctStr + ')' +
    '  |  日均增长: ' + dailySign + dailyAvg.toFixed(2);
}

function _buildHtml(uid, nickname, records, rangeDays, faceBase64, sign, milestoneTitle) {
  const templatePath = _paths.chartTemplate;

  if (!existsSync(templatePath)) {
    throw new Error('图表模板不存在: ' + templatePath);
  }

  let html = readFileSync(templatePath, 'utf-8');

  const timestamps = records.map((r) => r.timestamp);
  const fansCounts = records.map((r) => r.fansCount);

  if (fansCounts.length === 0) {
    throw new Error('没有历史数据可供渲染');
  }

  const { mode, yMin, yMax, interval } = _calcYAxis(fansCounts);
  const dataSpanMs = _calcDataSpan(records);
  const subtitleText = _buildSubtitle(records);

  const isHighPrecision = mode === 'highPrecision';

  const echartsFileUri = 'file:///' + ECHARTS_PATH.replace(/\\/g, '/');

  const currentFans = records.length > 0 ? records[records.length - 1].fansCount : 0;
  const firstFans = records.length > 0 ? records[0].fansCount : 0;
  const changeVal = currentFans - firstFans;
  const changePct = firstFans !== 0 ? ((changeVal / firstFans) * 100) : 0;
  const spanMs = _calcDataSpan(records);
  const spanDays = spanMs / (1000 * 60 * 60 * 24);
  const dailyAvg = spanDays > 0 ? (changeVal / spanDays) : 0;

  const truncatedSign = _truncateSign(sign);

  html = html.replaceAll('{{ECHARTS_PATH}}', echartsFileUri);
  html = html.replaceAll('{{TIMESTAMPS}}', JSON.stringify(timestamps));
  html = html.replaceAll('{{FANS_COUNTS}}', JSON.stringify(fansCounts));
  html = html.replaceAll('{{NICKNAME}}', _escapeHtml(nickname));
  html = html.replaceAll('{{UID}}', _escapeHtml(uid));
  html = html.replaceAll('{{RANGE_DAYS}}', String(rangeDays));
  html = html.replaceAll('{{Y_MIN}}', String(yMin));
  html = html.replaceAll('{{Y_MAX}}', String(yMax));
  html = html.replaceAll('{{Y_INTERVAL}}', String(interval));
  html = html.replaceAll('{{DATA_SPAN_MS}}', String(dataSpanMs));
  html = html.replaceAll('{{IS_HIGH_PRECISION}}', isHighPrecision ? 'true' : 'false');
  html = html.replaceAll('{{SUBTITLE_TEXT}}', _escapeHtml(subtitleText));
  html = html.replaceAll('{{FACE_BASE64}}', faceBase64 || '');
  html = html.replaceAll('{{SIGN_TEXT}}', _escapeHtml(truncatedSign));
  html = html.replaceAll('{{SIGN_HIDDEN}}', truncatedSign ? '' : 'hidden');
  html = html.replaceAll('{{CHANGE_CLASS}}', changeVal >= 0 ? 'positive' : 'negative');
  html = html.replaceAll('{{DAILY_CLASS}}', dailyAvg >= 0 ? 'positive' : 'negative');
  html = html.replaceAll('{{CURRENT_FANS}}', currentFans.toLocaleString());
  html = html.replaceAll('{{CHANGE_VAL}}', (changeVal >= 0 ? '+' : '') + changeVal.toLocaleString());
  html = html.replaceAll('{{CHANGE_PCT}}', (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%');
  html = html.replaceAll('{{DAILY_AVG}}', (dailyAvg >= 0 ? '+' : '') + dailyAvg.toFixed(2));
  html = html.replaceAll('{{MILESTONE_TITLE}}', _escapeHtml(milestoneTitle || ''));

  return html;
}

let _browser = null;
let _browserPromise = null;
let _renderCount = 0;
const _maxRenderCount = 200;

async function _getBrowser() {
  if (_browser && _browser.isConnected && _browser.isConnected()) {
    _renderCount++;
    if (_renderCount >= _maxRenderCount) {
      _renderCount = 0;
      try { await _browser.close(); } catch {}
      _browser = null;
      _browserPromise = null;
    } else {
      return _browser;
    }
  }

  if (_browserPromise) {
    return _browserPromise;
  }

  _browserPromise = (async () => {
    try {
      const puppeteerModule = await import('puppeteer');
      const launchOptions = {
        headless: 'new',
        args: [
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-sandbox',
          '--no-zygote',
          '--single-process',
        ],
      };
      _browser = await puppeteerModule.default.launch(launchOptions);
      _renderCount = 0;
      return _browser;
    } catch (err) {
      _browserPromise = null;
      throw err;
    }
  })();

  return _browserPromise;
}

class ChartRenderer {
  async renderFansChart(uid, nickname, records, rangeDays, faceUrl, sign, milestoneTitle) {
    _debugLog('图表开始渲染 uid=' + uid);

    if (!records || records.length === 0) {
      throw new Error('没有历史数据可供渲染');
    }

    if (records.length < 2) {
      throw new Error('历史数据不足，至少需要2个数据点才能生成趋势图');
    }

    // ── LTTB 降采样 ──
    const originalCount = records.length;
    if (originalCount > MAX_RENDER_POINTS) {
      records = downsampleRecords(records, MAX_RENDER_POINTS);
      if (_isDebug()) {
        _debugLog(
          '[LTTB] 原始点: ' + originalCount +
          ' 渲染点: ' + records.length +
          ' 抽样率: ' + ((1 - records.length / originalCount) * 100).toFixed(1) + '%'
        );
      }
    } else if (_isDebug()) {
      _debugLog('[LTTB] 点数 ' + originalCount + ' ≤ ' + MAX_RENDER_POINTS + '，无需降采样');
    }
    // ─────────────────────

    const faceBase64 = await _downloadAvatarAsBase64(faceUrl || '', uid);
    const html = _buildHtml(uid, nickname, records, rangeDays, faceBase64, sign || '', milestoneTitle || '');
    _debugLog('HTML生成完成');

    _ensureTempDir();
    const tempFile = join(TEMP_DIR, 'chart_' + uid + '_' + Date.now() + '.html');
    writeFileSync(tempFile, html, 'utf-8');

    // Debug: save HTML
    if (_isDebug()) {
      _ensureDir(_paths.debugHtmlDir);
      const debugHtmlPath = join(_paths.debugHtmlDir, 'chart_' + uid + '_' + Date.now() + '.html');
      writeFileSync(debugHtmlPath, html, 'utf-8');
      _debugLog('HTML已保存: ' + debugHtmlPath);
    }

    let browser = null;
    let page = null;

    try {
      browser = await _getBrowser();
      page = await browser.newPage();

      page.on('console', (msg) => {
        if (_isDebug()) {
          if (typeof logger !== 'undefined' && logger.mark) {
            logger.mark('[ChartConsole] ' + msg.text());
          }
        }
      });
      page.on('pageerror', (err) => {
        if (typeof logger !== 'undefined' && logger.error) {
          logger.error('[ChartPageError] ' + err.message);
        }
      });
      page.on('requestfailed', (req) => {
        if (_isDebug()) {
          if (typeof logger !== 'undefined' && logger.error) {
            logger.error('[ChartRequestFailed] ' + req.url());
          }
        }
      });

      await page.setViewport({ width: 800, height: 650, deviceScaleFactor: 2 });

      const fileUrl = 'file:///' + tempFile.replace(/\\/g, '/');
      await page.goto(fileUrl, {
        timeout: 30000,
        waitUntil: 'networkidle0',
      });

      try {
        await page.waitForFunction(
          () => document.body.getAttribute('data-rendered') === 'true',
          { timeout: 8000 }
        );
      } catch {
        // timeout is ok
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const buffer = await page.screenshot({
        type: 'png',
        fullPage: false,
        omitBackground: false,
      });

      _debugLog('截图成功');

      // Debug: save PNG
      if (_isDebug()) {
        _ensureDir(_paths.debugImageDir);
        const debugPngPath = join(_paths.debugImageDir, 'chart_' + uid + '_' + Date.now() + '.png');
        writeFileSync(debugPngPath, buffer);
        _debugLog('截图已保存: ' + debugPngPath);

        // Save chart debug metadata
        const { mode: yAxisMode } = _calcYAxis(records.map(r => r.fansCount));
        const debugMeta = {
          uid,
          nickname,
          sign: sign || '',
          face: faceUrl || '',
          recordsCount: records.length,
          renderMode: 'puppeteer',
          yAxisMode,
          generatedAt: new Date().toISOString(),
        };
        const debugMetaPath = join(_paths.debugImageDir, 'chart_' + uid + '_' + Date.now() + '.json');
        writeFileSync(debugMetaPath, JSON.stringify(debugMeta, null, 2), 'utf-8');
        _debugLog('调试元数据已保存: ' + debugMetaPath);
      }

      if (!Buffer.isBuffer(buffer)) {
        return Buffer.from(buffer);
      }

      return buffer;
    } catch (err) {
      _debugLog('截图失败: ' + (err.message || 'unknown'));
      throw err;
    } finally {
      if (page) {
        try { await page.close(); } catch {}
      }

      // 仅在未开启「保留调试 HTML」时清理临时文件
      if (!config.get('debugKeepHtml', false)) {
        try { unlinkSync(tempFile); } catch {}
      }
    }
  }

  async destroy() {
    if (_browser) {
      try { await _browser.close(); } catch {}
      _browser = null;
      _browserPromise = null;
    }
  }
}

const chartRenderer = new ChartRenderer();

export { chartRenderer as default, ChartRenderer };
