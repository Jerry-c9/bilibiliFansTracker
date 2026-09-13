import axios from 'axios';
import config from '../utils/config.js';
import cacheManager from './cache.manager.js';

const BILIBILI_API = {
  relationStat: 'https://api.bilibili.com/x/relation/stat',
  spaceUserInfo: 'https://api.bilibili.com/x/space/acc/info',
  card: 'https://api.bilibili.com/x/web-interface/card',
  search: 'https://api.bilibili.com/x/web-interface/search/type',
};

class BilibiliAPI {
  // 每次请求实时读取配置，保证 Guoba / 配置文件修改后无需重启即可生效
  _getTimeout() {
    const value = Number(config.get('apiTimeout', 10000));
    return Number.isFinite(value) && value > 0 ? value : 10000;
  }

  _getRetryCount() {
    const value = Number(config.get('apiRetryCount', 3));
    return Number.isFinite(value) && value >= 0 ? value : 3;
  }

  _getUserAgent() {
    return (
      config.get('userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36') ||
      'Mozilla/5.0'
    );
  }

  _getCookie() {
    const cookie = config.get('cookie', '');
    return typeof cookie === 'string' ? cookie.trim() : '';
  }

  _getHeaders() {
    const headers = {
      'User-Agent': this._getUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.bilibili.com/',
      'Origin': 'https://www.bilibili.com',
    };

    const cookie = this._getCookie();
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    return headers;
  }

  /**
   * 统一解析 B 站接口返回码，抛出带可读信息的错误
   * @param {object} data - 接口响应体
   * @param {string} fallbackMessage - 未知错误时的兜底信息
   * @returns {object} 校验通过的业务数据
   */
  _unwrap(data, fallbackMessage) {
    if (data && data.code === 0 && data.data) {
      return data.data;
    }

    if (data && data.code === -404) {
      throw new Error('UID不存在');
    }

    if (data && (data.code === -412 || data.code === -352)) {
      throw new Error(
        'B站接口触发风控(-' + Math.abs(data.code) + ')，请稍后重试，或在配置中填写 Cookie'
      );
    }

    throw new Error((data && data.message) || fallbackMessage);
  }

  async _request(url, params, retries) {
    const maxRetries = retries !== undefined ? retries : this._getRetryCount();
    let lastError = null;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await axios.get(url, {
          params,
          headers: this._getHeaders(),
          timeout: this._getTimeout(),
        });
        return response;
      } catch (err) {
        lastError = err;
        if (i < maxRetries) {
          await this._delay(1000 * (i + 1));
        }
      }
    }

    throw lastError;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getFansCount(uid) {
    const response = await this._request(BILIBILI_API.relationStat, { vmid: uid });
    const data = this._unwrap(response.data, '获取粉丝数失败');

    return {
      follower: data.follower || 0,
      following: data.following || 0,
    };
  }

  async getUserInfo(uid) {
    const response = await this._request(BILIBILI_API.spaceUserInfo, { mid: uid });
    const data = this._unwrap(response.data, '获取用户信息失败');

    return {
      nickname: data.name || '',
      face: data.face || '',
      sex: data.sex || '',
      level: data.level || 0,
      sign: data.sign || '',
    };
  }

  async getCardInfo(uid) {
    const response = await this._request(BILIBILI_API.card, { mid: uid });
    const data = this._unwrap(response.data, '获取卡片信息失败');
    const card = data.card || {};

    return {
      nickname: card.name || '',
      face: card.face || '',
      sign: card.sign || '',
      follower: data.follower || 0,
    };
  }

  async searchUser(keyword) {
    const response = await this._request(BILIBILI_API.search, {
      search_type: 'bili_user',
      keyword: keyword,
    });
    const data = response.data;

    // code === 0 但无结果属于正常情况，不应抛错
    if (!data || data.code !== 0) {
      this._unwrap(data, '搜索失败');
    }

    const results =
      data.data && Array.isArray(data.data.result) ? data.data.result : [];

    return results.map((item) => ({
      uid: String(item.mid || ''),
      nickname: item.uname || '',
      follower: item.fans || 0,
      face: item.upic || '',
      sign: item.usign || '',
    }));
  }

  async validateUid(uid) {
    try {
      await this.getFansCount(uid);
      return true;
    } catch (err) {
      if (err.message === 'UID不存在') {
        return false;
      }
      throw err;
    }
  }

  async getFansCountAndNickname(uid) {
    // Always fetch fans count fresh (never cached)
    let fansResult;
    try {
      fansResult = await this.getCardInfo(uid);
    } catch {
      const fallback = await this.getFansCount(uid);
      fansResult = { follower: fallback.follower, nickname: '', face: '', sign: '' };
    }

    const follower = fansResult.follower;
    let nickname = fansResult.nickname;
    let face = fansResult.face || '';
    let sign = fansResult.sign || '';

    // Try cache for user info (nickname, face, sign only — not follower)
    const cached = cacheManager.getUserInfo(uid);
    if (cached && !nickname) {
      nickname = cached.nickname;
      face = cached.face;
      sign = cached.sign;
    }

    // If still no user info, fetch from API
    if (!nickname) {
      try {
        const userInfo = await this.getUserInfo(uid);
        nickname = userInfo.nickname;
        face = userInfo.face || '';
        sign = userInfo.sign || '';
      } catch {
        nickname = 'UP主' + uid;
      }
    }

    // If card endpoint didn't return sign, try user info
    if (!sign && nickname !== 'UP主' + uid) {
      try {
        const userInfo = await this.getUserInfo(uid);
        sign = userInfo.sign || '';
      } catch {
        // sign is optional
      }
    }

    // Update cache
    if (nickname && nickname !== 'UP主' + uid) {
      cacheManager.setUserInfo(uid, { nickname, face, sign });
    }

    return { follower, nickname, face, sign };
  }
}

const bilibiliAPI = new BilibiliAPI();

export { bilibiliAPI as default, BilibiliAPI, BILIBILI_API };
