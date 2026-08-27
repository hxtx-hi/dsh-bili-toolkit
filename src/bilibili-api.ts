/**
 * B站API封装
 */

// ESM垫片：允许第三方CommonJS库使用require()
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import axios, { AxiosInstance } from 'axios';
import { getWbiKeys, generateWbiSignature } from './wbi-sign.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createServer, Server } from 'http';
import QRCode from 'qrcode';
import type {
  BilibiliConfig,
  SearchParams,
  SearchResultItem,
  VideoDetail,
  Comment,
  UserInfo,
  FavoriteFolder,
  HistoryItem,
  FollowItem,
  PlayUrlResult,
} from './types.js';

// Cookie持久化路径
const COOKIE_DIR = join(process.env.HOME || '/root', '.dsh', 'bilibili');
const COOKIE_FILE = join(COOKIE_DIR, 'cookie.txt');

/** 获取DSH工作区目录 */
export function getWorkspaceDir(): string {
  // 方法1: 从profile的package.json中找link:依赖推导workspace
  try {
    const profilePkg = join(process.env.HOME || '/root', '.dsh', 'profiles', 'web', 'package.json');
    const pkg = JSON.parse(readFileSync(profilePkg, 'utf-8'));
    const deps = pkg.dependencies || {};
    for (const v of Object.values(deps)) {
      const linkPath = String(v);
      if (linkPath.startsWith('link:')) {
        const absPath = linkPath.replace('link:', '');
        const parentDir = absPath.substring(0, absPath.lastIndexOf('/'));
        if (parentDir && existsSync(parentDir)) return parentDir;
      }
    }
  } catch (e) { /* 忽略 */ }

  // 方法2: 从DSH_SESSION_JSONL解码
  try {
    const sessionPath = process.env.DSH_SESSION_JSONL || '';
    const match = sessionPath.match(/sessions\/(--[^/]+)--\//);
    if (match) {
      const segments = match[1].split('-').filter(Boolean);
      const decoded = '/' + segments.join('/');
      if (decoded !== '/' && existsSync(decoded)) return decoded;
    }
  } catch (e) { /* 忽略 */ }

  return process.env.HOME || '/root';
}

export class BilibiliAPI {
  private axios: AxiosInstance;
  private config: BilibiliConfig;
  private imgKey: string = '';
  private subKey: string = '';
  private keyCacheTime: number = 0;
  private static KEY_CACHE_DURATION = 30 * 60 * 1000;

  constructor(config: BilibiliConfig = {}) {
    this.config = config;
    this.axios = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });
    // 优先使用构造参数，否则从文件加载
    if (config.cookie) {
      this.setCookie(config.cookie);
    } else {
      this.loadCookieFromFile();
    }
  }

  // ========== 基础 ==========

  setCookie(cookie: string): void {
    this.config.cookie = cookie;
    this.axios.defaults.headers.common['Cookie'] = cookie;
    // 自动持久化到文件
    this.saveCookieToFile(cookie);
  }
  getCookie(): string | undefined { return this.config.cookie; }
  isLoggedIn(): boolean { return !!this.config.cookie; }

  /** 清除Cookie（退出登录） */
  clearCookie(): void {
    this.config.cookie = undefined;
    delete this.axios.defaults.headers.common['Cookie'];
    try { writeFileSync(COOKIE_FILE, '', 'utf-8'); } catch (e) { /* 忽略 */ }
  }

  /** 从文件加载Cookie */
  private loadCookieFromFile(): void {
    try {
      const cookie = readFileSync(COOKIE_FILE, 'utf-8').trim();
      if (cookie) {
        this.setCookie(cookie);
      }
    } catch (e) { /* 文件不存在或读取失败，忽略 */ }
  }

  /** 持久化Cookie到文件 */
  private saveCookieToFile(cookie: string): void {
    try {
      mkdirSync(COOKIE_DIR, { recursive: true });
      writeFileSync(COOKIE_FILE, cookie, 'utf-8');
    } catch (e) { /* 写入失败，忽略 */ }
  }

  private async getKeys(): Promise<{ imgKey: string; subKey: string }> {
    const now = Date.now();
    if (this.imgKey && this.subKey && now - this.keyCacheTime < BilibiliAPI.KEY_CACHE_DURATION) {
      return { imgKey: this.imgKey, subKey: this.subKey };
    }
    const keys = await getWbiKeys(this.getCookie(), this.axios);
    this.imgKey = keys.imgKey;
    this.subKey = keys.subKey;
    this.keyCacheTime = now;
    return keys;
  }

  private async request(url: string, params: Record<string, any> = {}): Promise<any> {
    const response = await this.axios.get(url, { params });
    return response.data;
  }

  /** 从Cookie中提取csrf（bili_jct） */
  private getCsrf(): string {
    const cookie = this.config.cookie || '';
    const match = cookie.match(/bili_jct=([^;]+)/);
    return match ? match[1] : '';
  }

  private async post(url: string, data: any = {}): Promise<any> {
    // 自动追加csrf参数
    const csrf = this.getCsrf();
    const postData = typeof data === 'string'
      ? (data ? `${data}&csrf=${csrf}` : `csrf=${csrf}`)
      : { ...data, csrf };
    const response = await this.axios.post(url, postData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  }

  /** 从URL或BV号中提取BV号 */
  static extractBvid(input: string): string | null {
    if (/^BV[\w]{10}$/.test(input)) return input;
    const match = input.match(/BV[\w]{10}/);
    return match ? match[0] : null;
  }

  // ========== 搜索与信息 ==========

  async search(params: SearchParams): Promise<{ result: SearchResultItem[]; numResults: number }> {
    const url = 'https://api.bilibili.com/x/web-interface/wbi/search/all/v2';
    const result = await this.request(url, {
      keyword: params.keyword,
      page: params.page || 1,
      pagesize: params.pageSize || 20,
      search_type: params.searchType || 'video',
    });
    if (result.code !== 0) throw new Error(result.message || '搜索失败');
    return result.data;
  }

  /** 搜索UP主/用户 */
  async searchUsers(keyword: string, page: number = 1): Promise<any[]> {
    const keys = await this.getKeys();
    const params: Record<string, string> = {
      keyword, search_type: 'bili_user', page: String(page), order: 'fans',
    };
    const wbi = generateWbiSignature(params, keys.imgKey, keys.subKey);
    const response = await this.axios.get('https://api.bilibili.com/x/web-interface/wbi/search/type', {
      params: { keyword, search_type: 'bili_user', page, order: 'fans', wts: wbi.wts, w_rid: wbi.w_rid },
      headers: { Referer: 'https://search.bilibili.com' },
    });
    const result = response.data;
    if (result.code !== 0) throw new Error(result.message || '搜索用户失败');
    return result.data?.result || [];
  }

  /** 获取用户认证标签（蓝V/黄V） */
  async getVerifyTag(mid: number): Promise<string> {
    try {
      const result = await this.request('https://api.bilibili.com/x/web-interface/card', { mid });
      const ov = result.data?.card?.official_verify;
      if (ov?.type === 0) return ' (黄V)';
      if (ov?.type === 1) return ' (蓝V)';
    } catch (e) { /* 忽略 */ }
    return '';
  }

  /** 批量获取多个用户的认证标签 */
  async getVerifyTags(mids: number[]): Promise<Map<number, string>> {
    const tagMap = new Map<number, string>();
    const uniqueMids = [...new Set(mids.filter(m => m > 0))];
    await Promise.all(uniqueMids.map(async (mid) => {
      const tag = await this.getVerifyTag(mid);
      if (tag) tagMap.set(mid, tag);
    }));
    return tagMap;
  }

  async getVideoDetail(bvid: string): Promise<VideoDetail> {
    const url = 'https://api.bilibili.com/x/web-interface/view';
    const result = await this.request(url, { bvid });
    if (result.code !== 0) throw new Error(result.message || '获取视频详情失败');
    return result.data;
  }

  async getComments(oid: number, next: number = 0): Promise<{ replies: Comment[]; cursor: any }> {
    const url = 'https://api.bilibili.com/x/v2/reply/main';
    const result = await this.request(url, { type: 1, oid, mode: 3, next });
    if (result.code !== 0) throw new Error(result.message || '获取评论失败');
    return result.data;
  }

  async getUserInfo(mid: number): Promise<UserInfo> {
    const url = 'https://api.bilibili.com/x/space/acc/info';
    const result = await this.request(url, { mid });
    if (result.code !== 0) throw new Error(result.message || '获取用户信息失败');
    const statResult = await this.request('https://api.bilibili.com/x/relation/stat', { vmid: mid });
    return { ...result.data, fans: statResult.data?.follower || 0, attention: statResult.data?.following || 0 };
  }

  // ========== 推荐列表 ==========

  async getRecommend(): Promise<any[]> {
    const url = 'https://api.bilibili.com/x/web-interface/index/top/feed/rcmd';
    const result = await this.request(url, { fresh_type: 0, feed_version: 'V8', fresh_pos: 0 });
    if (result.code !== 0) throw new Error(result.message || '获取推荐失败');
    return result.data?.item || [];
  }

  // ========== 字幕 ==========

  async getSubtitle(bvid: string, cid?: number): Promise<any[]> {
    if (!cid) {
      const detail = await this.getVideoDetail(bvid);
      cid = detail.cid;
    }
    const url = 'https://api.bilibili.com/x/player/wbi/v2';
    const result = await this.request(url, { bvid, cid });
    if (result.code !== 0) throw new Error(result.message || '获取字幕信息失败');
    return result.data?.subtitle?.subtitles || [];
  }

  async getSubtitleContent(subtitleUrl: string): Promise<any[]> {
    const fullUrl = subtitleUrl.startsWith('http') ? subtitleUrl : `https:${subtitleUrl}`;
    const response = await this.axios.get(fullUrl);
    return response.data?.body || [];
  }

  async getFullSubtitle(bvid: string, cid?: number): Promise<{
    hasSubtitle: boolean;
    subtitleList: Array<{ lan: string; lanDoc: string; subtitleUrl: string }>;
    content: Array<{ from: number; to: number; content: string }>;
    isEnglishOnly: boolean;
  }> {
    const subtitles = await this.getSubtitle(bvid, cid);
    if (!subtitles || subtitles.length === 0) {
      return { hasSubtitle: false, subtitleList: [], content: [], isEnglishOnly: false };
    }
    // 优先选择中文字幕（ai-zh 或 zh-CN 等）
    const zhSubtitle = subtitles.find((s: any) => s.lan === 'ai-zh' || s.lan === 'zh-CN' || s.lan === 'zh');
    const englishOnly = !zhSubtitle && subtitles.every((s: any) => s.lan?.startsWith('ai-en'));
    const selectedSubtitle = zhSubtitle || subtitles[0];
    const content = await this.getSubtitleContent(selectedSubtitle.subtitle_url);
    return {
      hasSubtitle: true,
      subtitleList: subtitles.map((s: any) => ({ lan: s.lan, lanDoc: s.lan_doc, subtitleUrl: s.subtitle_url })),
      content,
      isEnglishOnly: englishOnly,
    };
  }

  // ========== 用户数据 ==========

  async getFavoriteFolders(upMid?: number): Promise<FavoriteFolder[]> {
    const url = 'https://api.bilibili.com/x/v3/fav/folder/created/list-all';
    const params: Record<string, any> = {};
    // 如果没有传upMid，从cookie中提取DedeUserID，或通过nav接口获取
    if (upMid) {
      params.up_mid = upMid;
    } else {
      // 从cookie中提取DedeUserID
      const cookie = this.config.cookie || '';
      const match = cookie.match(/DedeUserID=(\d+)/);
      if (match) {
        params.up_mid = match[1];
      }
    }
    const result = await this.request(url, params);
    if (result.code !== 0) throw new Error(result.message || '获取收藏夹列表失败');
    return result.data?.list || [];
  }

  async getHistory(): Promise<HistoryItem[]> {
    const url = 'https://api.bilibili.com/x/v2/history';
    const result = await this.request(url);
    if (result.code !== 0) throw new Error(result.message || '获取观看历史失败');
    return result.data || [];
  }

  /** 获取更多历史记录（自动翻页，目标150条+） */
  async getHistoryMore(targetCount: number = 150): Promise<any[]> {
    const allItems: any[] = [];
    let max = 0;
    let pn = 1;
    const ps = 20;
    while (allItems.length < targetCount && pn <= 10) {
      try {
        const url = 'https://api.bilibili.com/x/web-interface/history/cursor';
        const params: Record<string, any> = { ps };
        if (max) params.max = max;
        const result = await this.request(url, params);
        if (result.code !== 0) break;
        const list = result.data?.list || [];
        if (list.length === 0) break;
        allItems.push(...list);
        max = result.data?.cursor?.max || 0;
        pn++;
      } catch (e) { break; }
    }
    return allItems.slice(0, targetCount);
  }

  /** 获取收藏夹视频内容 */
  async getFavoriteItems(mediaId: number, pn: number = 1, ps: number = 20): Promise<{ items: any[]; count: number }> {
    const url = 'https://api.bilibili.com/x/v3/fav/resource/list';
    const result = await this.request(url, { media_id: mediaId, pn, ps, order: 'mtime' });
    if (result.code !== 0) return { items: [], count: 0 };
    const items = (result.data?.medias || []).map((m: any) => ({
      bvid: m.bvid, title: m.title, owner: { name: m.upper?.name || '未知', mid: m.upper?.mid },
      stat: { view: m.cnt_info?.play, like: m.cnt_info?.thumb_up },
      tname: m.typename, duration: m.duration,
    }));
    return { items, count: result.data?.info?.total || 0 };
  }

  /** 获取收藏夹所有视频（自动翻页） */
  async getFavoriteItemsAll(mediaId: number, maxCount: number = 50): Promise<any[]> {
    const allItems: any[] = [];
    let pn = 1;
    while (allItems.length < maxCount && pn <= 5) {
      const { items } = await this.getFavoriteItems(mediaId, pn, 20);
      if (items.length === 0) break;
      allItems.push(...items);
      pn++;
    }
    return allItems.slice(0, maxCount);
  }

  /** 获取稍后再看列表 */
  async getWatchLater(): Promise<any[]> {
    const url = 'https://api.bilibili.com/x/v2/history/toview';
    const result = await this.request(url);
    if (result.code !== 0) return [];
    return result.data?.list || [];
  }

  async getFollowings(vmId: number, all: boolean = true): Promise<{ list: FollowItem[]; total: number }> {
    const url = 'https://api.bilibili.com/x/relation/followings';
    if (!all) {
      const result = await this.request(url, { vmid: vmId, pn: 1, ps: 50 });
      if (result.code !== 0) throw new Error(result.message || '获取关注列表失败');
      return result.data || { list: [], total: 0 };
    }
    // 自动翻页获取全部关注
    const allList: FollowItem[] = [];
    let pn = 1;
    const ps = 50;
    let total = 0;
    while (true) {
      const result = await this.request(url, { vmid: vmId, pn, ps });
      if (result.code !== 0) throw new Error(result.message || '获取关注列表失败');
      const list = result.data?.list || [];
      total = result.data?.total || 0;
      allList.push(...list);
      if (allList.length >= total || list.length < ps) break;
      pn++;
    }
    return { list: allList, total };
  }

  /** 获取当前登录用户信息 */
  async getNavInfo(): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/web-interface/nav', {});
    return result.data || {};
  }

  /** 获取UP主最近的视频列表 */
  async getUserVideos(mid: number, count: number = 10): Promise<any[]> {
    const keys = await this.getKeys();
    const riskParams: Record<string, string> = {
      dm_img_list: '[]',
      dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ',
      dm_cover_img_str: 'QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDEwNjAgNkdCIERpcmVjdDNEMTEgdnNfNV8wIHBzXVfMCwgRDNEMTEp',
      dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
    };
    const allParams: Record<string, string> = {
      mid: String(mid), pn: '1', ps: String(count), order: 'pubdate',
      ...riskParams,
    };
    const wbi = generateWbiSignature(allParams, keys.imgKey, keys.subKey);
    const response = await this.axios.get('https://api.bilibili.com/x/space/wbi/arc/search', {
      params: { mid, pn: 1, ps: count, order: 'pubdate', wts: wbi.wts, w_rid: wbi.w_rid, ...riskParams },
      headers: { Referer: `https://space.bilibili.com/${mid}/video` },
    });
    return response.data?.data?.list?.vlist || [];
  }

  // ========== 消息 ==========

  /** 获取未读消息数 */
  async getUnreadCount(): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/msgfeed/unread', {});
    return result.data || {};
  }

  /** 获取回复我的消息 */
  async getReplyMeMessages(pn: number = 1, ps: number = 20): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/msgfeed/reply', { pn, ps });
    return result.data || {};
  }

  /** 获取@我的消息 */
  async getAtMeMessages(pn: number = 1, ps: number = 20): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/msgfeed/at', { pn, ps });
    return result.data || {};
  }

  /** 获取收到的赞 */
  async getLikeMessages(pn: number = 1, ps: number = 20): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/msgfeed/like', { pn, ps });
    return result.data || {};
  }

  /** 获取系统通知 */
  async getSystemMessages(pn: number = 1, ps: number = 20): Promise<any> {
    const result = await this.request('https://api.bilibili.com/x/sys_msg/list', { pn, ps });
    return result.data || {};
  }

  // ========== 用户操作 ==========

  async like(bvid: string): Promise<boolean> {
    const aid = (await this.getVideoDetail(bvid)).aid;
    const result = await this.post('https://api.bilibili.com/x/web-interface/archive/like', `aid=${aid}&like=1`);
    return result.code === 0;
  }

  async unlike(bvid: string): Promise<boolean> {
    const aid = (await this.getVideoDetail(bvid)).aid;
    const result = await this.post('https://api.bilibili.com/x/web-interface/archive/like', `aid=${aid}&like=0`);
    return result.code === 0;
  }

  async coin(bvid: string, multiply: number = 1): Promise<boolean> {
    const aid = (await this.getVideoDetail(bvid)).aid;
    const result = await this.post('https://api.bilibili.com/x/web-interface/coin/add', `aid=${aid}&multiply=${multiply}&select_like=1`);
    return result.code === 0;
  }

  async favorite(mediaId: number, resources: string): Promise<boolean> {
    const result = await this.post('https://api.bilibili.com/x/v3/fav/resource/deal', `media_id=${mediaId}&resources=${resources}`);
    return result.code === 0;
  }

  async follow(mid: number): Promise<boolean> {
    const result = await this.post('https://api.bilibili.com/x/relation/modify', `fid=${mid}&act=1`);
    return result.code === 0;
  }

  async unfollow(mid: number): Promise<boolean> {
    const result = await this.post('https://api.bilibili.com/x/relation/modify', `fid=${mid}&act=2`);
    return result.code === 0;
  }

  // ========== 视频流 ==========

  async getPlayUrl(bvid: string, cid: number, qn: number = 80, fnval: number = 4048): Promise<PlayUrlResult> {
    const url = 'https://api.bilibili.com/x/player/playurl';
    const result = await this.request(url, { bvid, cid, qn, fnval });
    if (result.code !== 0) throw new Error(result.message || '获取播放地址失败');
    return result.data;
  }

  async getVideoStreams(bvid: string, cid?: number): Promise<{ video: any[]; audio: any[]; duration: number }> {
    if (!cid) {
      const detail = await this.getVideoDetail(bvid);
      cid = detail.cid;
    }
    const playUrl = await this.getPlayUrl(bvid, cid!);
    if (!playUrl.dash) throw new Error('无法获取视频流信息');
    return {
      video: playUrl.dash.video || [],
      audio: playUrl.dash.audio || [],
      duration: playUrl.dash.duration || 0,
    };
  }

  // ========== 二维码登录 ==========

  /** 生成登录二维码 */
  async generateQrCode(): Promise<{ url: string; qrcodeKey: string }> {
    const result = await this.request('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
    if (result.code !== 0) throw new Error(result.message || '生成二维码失败');
    return {
      url: result.data.url,
      qrcodeKey: result.data.qrcode_key,
    };
  }

  /** 轮询二维码扫描状态 */
  async pollQrCode(qrcodeKey: string): Promise<{
    status: number;
    message: string;
    cookie?: string;
    url?: string;
  }> {
    // 用axios直接请求以获取Set-Cookie响应头
    const response = await this.axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', {
      params: { qrcode_key: qrcodeKey },
    });
    const result = response.data;
    const setCookies = response.headers['set-cookie'] as string[] | undefined;
    // status: 0=成功, 86101=未扫码, 86090=已扫描未确认, 86038=已过期
    const data = result.data;
    let status = -1;
    let message = data.message || '';
    let cookie: string | undefined;

    // 从poll API的Set-Cookie头中提取cookie（这是B站返回cookie的标准方式）
    if (setCookies && setCookies.length > 0) {
      const cookieParts: string[] = [];
      for (const sc of setCookies) {
        const match = sc.split(';')[0]?.trim();
        if (match) cookieParts.push(match);
      }
      if (cookieParts.length > 0) {
        cookie = cookieParts.join('; ');
      }
    }

    switch (data.code) {
      case 0:
        status = 0;
        message = '登录成功';
        // cookie已经在上面从poll响应头中提取了，直接保存
        if (cookie) {
          this.setCookie(cookie);
        } else {
          // 备用：尝试从data.url请求获取cookie
          if (data.url) {
            try {
              const resp = await this.axios.get(data.url, { maxRedirects: 5, validateStatus: () => true });
              const setCookies = resp.headers['set-cookie'];
              if (setCookies && setCookies.length > 0) {
                const cookieParts: string[] = [];
                for (const sc of setCookies) {
                  const match = sc.split(';')[0]?.trim();
                  if (match) cookieParts.push(match);
                }
                if (cookieParts.length > 0) {
                  cookie = cookieParts.join('; ');
                  this.setCookie(cookie);
                }
              }
            } catch (e) { /* 忽略 */ }
          }
        }
        break;
      case 86101:
        status = 3;
        message = '未扫码，等待扫描';
        break;
      case 86090:
        status = 1;
        message = '已扫码，请在手机上确认登录';
        break;
      case 86038:
        status = 2;
        message = '二维码已过期，请重新获取';
        break;
      default:
        status = -1;
        message = data.message || '未知状态';
    }

    return { status, message, cookie, url: data.url };
  }

  /** 启动本地二维码登录服务（端口8031，5分钟超时） */
  async startQrLoginServer(): Promise<{ port: number; url: string }> {
    this.stopQrLoginServer();
    const TIMEOUT = 5 * 60 * 1000;

    // 生成页面HTML（横屏优化，无emoji）
    const svgTV = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>';
    const svgRefresh = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
    const svgClose = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const svgCheck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    const svgKey = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#064e3b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
    const svgPhone = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>';
    const svgLogOut = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    const svgCoin = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8"/></svg>';
    const svgPeople = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
    const svgHeart = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    const buildPage = (qrDataUrl: string, qrKey: string) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>B站扫码登录 - DSH</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",Helvetica,Arial,sans-serif;background:#f0fdf4;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#064e3b}
    .card{background:#fff;border:1px solid #d1fae5;border-radius:14px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);text-align:center;max-width:420px;width:95%}
    .logo{width:56px;height:56px;border-radius:50%;background:#f0fdf4;border:2px solid #d1fae5;display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px}
    h1{font-size:18px;color:#064e3b;margin-bottom:2px;font-weight:600}
    .sub{font-size:12px;color:#6b7280;margin-bottom:16px}
    .qr-box{display:inline-block;padding:12px;border:1px solid #d1fae5;border-radius:12px;margin-bottom:12px;background:#f9fdfb;position:relative;transition:all .3s}
    .qr-box img{display:block;border-radius:8px;transition:opacity .3s;width:160px;height:160px}
    .qr-box.loading img{opacity:.3}
    .qr-box.loading::after{content:'';position:absolute;top:50%;left:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border:3px solid #10b981;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .fade-in{animation:fadeIn .3s ease}
    @keyframes fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
    #status{padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:8px;transition:all .3s}
    .st-waiting{background:#f0fdf4;color:#064e3b;border:1px solid #d1fae5}
    .st-scanned{background:#f0fdf4;color:#059669;border:1px solid #a7f3d0}
    .st-success{background:#f0fdf4;color:#065f46;border:1px solid #6ee7b7;font-weight:600}
    .st-expired{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .st-error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .timer{font-size:11px;color:#9ca3af;margin-bottom:10px}
    .btn-group{display:flex;gap:8px;justify-content:center;margin-bottom:12px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border:none;border-radius:8px;font-size:12px;cursor:pointer;transition:all .2s;font-weight:500}
    .btn-primary{background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-primary:active{transform:translateY(0)}
    .btn-secondary{background:#f0fdf4;color:#064e3b;border:1px solid #d1fae5}
    .btn-secondary:hover{background:#dcfce7}
    .btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important}
    .steps{text-align:left;font-size:11px;color:#6b7280;padding:10px 12px;background:#f9fdfb;border:1px solid #d1fae5;border-radius:8px}
    .steps li{margin-bottom:4px;list-style:none;display:flex;align-items:center;gap:6px}
    .steps li svg{flex-shrink:0}
    .divider{text-align:center;margin:14px 0;color:#d1fae5;font-size:11px;position:relative}
    .divider::before,.divider::after{content:'';position:absolute;top:50%;width:30%;height:1px;background:#d1fae5}
    .divider::before{left:0}.divider::after{right:0}
    .cookie-section{text-align:left;padding:14px;background:#f9fdfb;border:1px solid #d1fae5;border-radius:10px}
    .cookie-section h3{font-size:13px;color:#064e3b;margin-bottom:4px;font-weight:600;display:flex;align-items:center;gap:6px}
    .cookie-section p{font-size:11px;color:#6b7280;margin-bottom:8px}
    .cookie-section textarea{width:100%;height:52px;border:1px solid #d1fae5;border-radius:8px;padding:8px;font-size:11px;font-family:monospace;resize:none;outline:none;transition:border-color .2s;background:#fff;color:#064e3b}
    .cookie-section textarea:focus{border-color:#10b981}
    .cookie-section textarea::placeholder{color:#9ca3af}
    .btn-cookie{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:8px;padding:8px;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all .2s}
    .btn-cookie:hover{opacity:.9;transform:translateY(-1px)}
    .btn-cookie:active{transform:translateY(0)}
    .btn-cookie:disabled{opacity:.5;cursor:not-allowed;transform:none!important}
    .cookie-msg{margin-top:6px;font-size:11px;padding:6px 10px;border-radius:6px}
    .cookie-msg.ok{background:#f0fdf4;color:#065f46;border:1px solid #a7f3d0}
    .cookie-msg.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .user-panel{display:none;text-align:center}
    .user-panel.active{display:block}
    .user-panel .avatar{width:64px;height:64px;border-radius:50%;border:3px solid #d1fae5;object-fit:cover;margin-bottom:8px}
    .user-panel .uname{font-size:16px;font-weight:600;color:#064e3b;margin-bottom:2px}
    .user-panel .level{display:inline-block;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-bottom:6px}
    .user-panel .sign{font-size:11px;color:#6b7280;margin-bottom:10px;font-style:italic}
    .user-panel .stats{display:flex;justify-content:center;gap:24px;margin-bottom:14px}
    .user-panel .stat-item{display:flex;flex-direction:column;align-items:center;gap:2px}
    .user-panel .stat-icon{display:flex;align-items:center;justify-content:center}
    .user-panel .stat-num{font-size:18px;font-weight:700;color:#10b981}
    .user-panel .stat-label{font-size:10px;color:#9ca3af}
    .user-panel .action-btns{display:flex;gap:8px;justify-content:center}
    .btn-logout{display:inline-flex;align-items:center;gap:6px;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;transition:all .2s;font-weight:500}
    .btn-logout:hover{background:#fee2e2}
    .btn-close-server{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:12px;cursor:pointer;transition:all .2s;font-weight:500}
    .btn-close-server:hover{opacity:.9}
    .login-columns{display:flex;flex-direction:column;gap:0}
    .col-divider{margin:14px 0}
    @media (orientation:landscape) and (min-width:700px){
      .card{max-width:720px;padding:24px 36px}
      .login-columns{flex-direction:row;gap:28px;align-items:stretch}
      .col-qr,.col-cookie{flex:1;min-width:0}
      .col-divider{display:none}
      .col-qr{display:flex;flex-direction:column;align-items:center}
      .cookie-section{height:100%;display:flex;flex-direction:column}
      .cookie-section textarea{flex:1;min-height:48px}
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">${svgTV}</div>
    <h1>B站扫码登录</h1>
    <p class="sub">请使用哔哩哔哩APP扫描下方二维码</p>
    <div class="login-columns" id="loginColumns">
      <div class="col-qr">
        <div class="qr-box" id="qrBox"><img id="qr" src="${qrDataUrl}" alt="登录二维码"></div>
        <div id="status" class="st-waiting">等待扫码中...</div>
        <div class="timer" id="timer">剩余时间：5:00</div>
        <div class="btn-group">
          <button class="btn btn-primary" id="btnRefresh" onclick="doRefresh()">${svgRefresh} 刷新二维码</button>
        </div>
        <ul class="steps">
          <li>${svgPhone} 打开哔哩哔哩APP</li>
          <li>${svgPhone} 点击左上角扫一扫</li>
          <li>${svgPhone} 扫描上方二维码</li>
          <li>${svgPhone} 在手机上确认登录</li>
        </ul>
      </div>
      <div class="divider col-divider">或者</div>
      <div class="col-cookie">
        <div class="cookie-section">
          <h3>${svgKey} 导入Cookie登录</h3>
          <p>粘贴B站Cookie字符串（包含SESSDATA、bili_jct等）</p>
          <textarea id="cookieInput" placeholder="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"></textarea>
          <button class="btn-cookie" id="btnCookie" onclick="doSetCookie()">${svgCheck} 确认登录</button>
          <div id="cookieMsg"></div>
        </div>
      </div>
    </div>
    <div class="btn-group" style="margin-top:12px">
      <button class="btn btn-secondary" onclick="doClose()">${svgClose} 关闭页面</button>
    </div>
    <div class="user-panel" id="userPanel">
      <img class="avatar" id="userAvatar" src="" alt="头像">
      <div class="uname" id="userName"></div>
      <div class="level" id="userLevel"></div>
      <div class="sign" id="userSign"></div>
      <div class="stats">
        <div class="stat-item"><div class="stat-icon">${svgCoin}</div><div class="stat-num" id="userCoin">0</div><div class="stat-label">硬币</div></div>
        <div class="stat-item"><div class="stat-icon">${svgPeople}</div><div class="stat-num" id="userFollowing">0</div><div class="stat-label">关注</div></div>
        <div class="stat-item"><div class="stat-icon">${svgHeart}</div><div class="stat-num" id="userFollower">0</div><div class="stat-label">粉丝</div></div>
      </div>
      <div class="action-btns">
        <button class="btn-logout" onclick="doLogout()">${svgLogOut} 退出登录</button>
        <button class="btn-close-server" onclick="doClose()">${svgClose} 关闭页面</button>
      </div>
    </div>
  </div>
  <script>
    let qrKey = '';
    let pollTimer, countDown;
    let remaining = ${TIMEOUT / 1000};
    let failCount = 0;
    const MAX_FAIL = 5;

    window.addEventListener('DOMContentLoaded', async () => {
      try {
        const loginRes = await fetch('/api/bilibili/current-user');
        const loginData = await loginRes.json();
        if (loginData.isLogin) { showUserPanel(); return; }
      } catch (e) {}
      await loadQR();
    });

    async function loadQR() {
      const box = document.getElementById('qrBox');
      const el = document.getElementById('status');
      const img = document.getElementById('qr');
      box.classList.add('loading');
      el.className = 'st-waiting'; el.textContent = '正在加载二维码...';
      try {
        const res = await fetch('/api/bilibili/qr-generate');
        const data = await res.json();
        if (data.code === 0 && data.qrDataUrl && data.qrcodeKey) {
          qrKey = data.qrcodeKey; failCount = 0;
          img.src = data.qrDataUrl;
          img.classList.add('fade-in');
          el.className = 'st-waiting'; el.textContent = '等待扫码中...';
          box.classList.remove('loading');
          remaining = ${TIMEOUT / 1000};
          clearInterval(countDown);
          countDown = setInterval(updateTimer, 1000);
          clearInterval(pollTimer);
          pollTimer = setInterval(poll, 1000);
        } else {
          el.className = 'st-error'; el.textContent = '加载失败：' + (data.message || '未知');
          box.classList.remove('loading');
        }
      } catch(e) {
        el.className = 'st-error'; el.textContent = '网络错误';
        box.classList.remove('loading');
      }
    }

    function updateTimer() {
      let m = Math.floor(remaining / 60);
      let s = remaining % 60;
      document.getElementById('timer').textContent = '剩余时间：' + m + ':' + (s < 10 ? '0' : '') + s;
      if (remaining <= 0) { clearInterval(countDown); return; }
      remaining--;
    }

    async function poll() {
      if (!qrKey) return;
      try {
        const res = await fetch('/api/bilibili/qr-check', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ qrcodeKey: qrKey })
        });
        const data = await res.json();
        const el = document.getElementById('status');
        if (data.code === 0) {
          el.className = 'st-success fade-in';
          el.textContent = '登录成功！账号已保存，正在跳转...';
          clearInterval(pollTimer); clearInterval(countDown);
          setTimeout(() => showUserPanel(), 1000);
          return;
        } else if (data.code === 1 || data.code === 86101) {
          if (data.code === 1) {
            el.className = 'st-scanned fade-in';
            el.textContent = '已扫码，请在手机上确认登录...';
          } else {
            el.className = 'st-waiting';
            el.textContent = '等待扫码中...';
          }
          failCount = 0;
        } else if (data.code === 86038) {
          el.className = 'st-expired fade-in';
          el.textContent = '二维码已过期，请点击刷新获取新二维码';
          clearInterval(pollTimer);
          return;
        } else {
          failCount++;
          if (failCount >= MAX_FAIL) {
            el.className = 'st-expired fade-in';
            el.textContent = '连接异常，请点击刷新获取新二维码';
            clearInterval(pollTimer);
          }
        }
      } catch(e) {
        failCount++;
        if (failCount >= MAX_FAIL) {
          clearInterval(pollTimer);
          document.getElementById('status').className = 'st-error fade-in';
          document.getElementById('status').textContent = '网络异常，请点击刷新';
        }
      }
    }
    pollTimer = setInterval(poll, 3000);

    async function doRefresh() {
      const box = document.getElementById('qrBox');
      const btn = document.getElementById('btnRefresh');
      const el = document.getElementById('status');
      btn.disabled = true; btn.textContent = '刷新中...';
      box.classList.add('loading');
      el.className = 'st-waiting'; el.textContent = '正在获取新二维码...';
      try {
        const res = await fetch('/api/bilibili/qr-generate');
        const data = await res.json();
        if (data.code === 0 && data.qrDataUrl && data.qrcodeKey) {
          qrKey = data.qrcodeKey; failCount = 0;
          const img = document.getElementById('qr');
          img.src = data.qrDataUrl;
          remaining = ${TIMEOUT / 1000};
          el.className = 'st-waiting fade-in'; el.textContent = '等待扫码中...';
          box.classList.remove('loading');
          clearInterval(countDown);
          countDown = setInterval(updateTimer, 1000);
          clearInterval(pollTimer);
          pollTimer = setInterval(poll, 1000);
        } else {
          el.className = 'st-error'; el.textContent = '刷新失败：' + (data.message || '未知错误');
          box.classList.remove('loading');
        }
      } catch(e) {
        el.className = 'st-error'; el.textContent = '刷新失败：网络错误';
        box.classList.remove('loading');
      }
      btn.disabled = false; btn.innerHTML = '${svgRefresh} 刷新二维码';
    }

    function doClose() {
      fetch('/api/bilibili/qr-close', { method: 'POST' }).catch(() => {});
      window.close();
    }

    async function showUserPanel() {
      try {
        const res = await fetch('/api/bilibili/current-user');
        const data = await res.json();
        if (data.isLogin) {
          document.getElementById('loginColumns').style.display = 'none';
          document.querySelectorAll('.card > .btn-group').forEach(el => el.style.display = 'none');
          document.querySelector('.card > h1').style.display = 'none';
          document.querySelector('.card > .sub').style.display = 'none';
          const panel = document.getElementById('userPanel');
          panel.classList.add('active');
          document.getElementById('userAvatar').src = data.face ? '/api/bilibili/avatar-proxy?url=' + encodeURIComponent(data.face) : '';
          document.getElementById('userName').textContent = data.uname || '';
          document.getElementById('userLevel').textContent = 'Lv.' + (data.level || 1);
          document.getElementById('userSign').textContent = data.sign || '这个用户很懒，什么都没写';
          document.getElementById('userCoin').textContent = data.coins || 0;
          document.getElementById('userFollowing').textContent = data.following || 0;
          document.getElementById('userFollower').textContent = data.follower || 0;
          document.title = data.uname + ' - 已登录';
        }
      } catch (e) {}
    }

    async function doLogout() {
      if (!confirm('确定要退出登录吗？')) return;
      try {
        await fetch('/api/bilibili/logout', { method: 'POST' });
        document.getElementById('userPanel').classList.remove('active');
        document.getElementById('loginColumns').style.display = '';
        document.querySelectorAll('.card > .btn-group').forEach(el => el.style.display = '');
        document.querySelector('.card > h1').style.display = '';
        document.querySelector('.card > .sub').style.display = '';
        document.getElementById('status').className = 'st-waiting';
        document.getElementById('status').textContent = '已退出登录，请重新扫码或导入Cookie';
        document.title = 'B站扫码登录 - DSH';
        doRefresh();
      } catch (e) {
        alert('退出失败：' + e.message);
      }
    }

    async function doSetCookie() {
      const input = document.getElementById('cookieInput');
      const btn = document.getElementById('btnCookie');
      const msg = document.getElementById('cookieMsg');
      const cookie = input.value.trim();
      if (!cookie) { msg.className = 'cookie-msg err'; msg.textContent = '请输入Cookie'; return; }
      btn.disabled = true; btn.textContent = '验证中...';
      try {
        const res = await fetch('/api/bilibili/cookie-set', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ cookie })
        });
        const data = await res.json();
        if (data.success) {
          msg.className = 'cookie-msg ok'; msg.textContent = data.message;
          btn.textContent = '登录成功！';
          showUserPanel();
        } else {
          msg.className = 'cookie-msg err'; msg.textContent = data.message;
          btn.disabled = false; btn.innerHTML = '${svgCheck} 确认登录';
        }
      } catch(e) {
        msg.className = 'cookie-msg err'; msg.textContent = '网络错误';
        btn.disabled = false; btn.innerHTML = '${svgCheck} 确认登录';
      }
    }
  </script>
</body>
</html>`;

    // Fire-and-forget: 启动HTTP服务
    const server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.url === '/' && req.method === 'GET') {
        // 先返回页面骨架，二维码通过AJAX异步加载
        const qrPlaceholder = QRCode.toDataURL('https://www.bilibili.com', { width: 280, margin: 2 });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildPage(qrPlaceholder, ''));

      } else if (req.url === '/api/bilibili/qr-generate' && req.method === 'GET') {
        try {
          const qrData = await this.generateQrCode();
          const qrDataUrl = await QRCode.toDataURL(qrData.url, { width: 280, margin: 2 });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, qrDataUrl, qrcodeKey: qrData.qrcodeKey }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, message: (e as Error).message }));
        }

      } else if (req.url === '/api/bilibili/qr-refresh' && req.method === 'GET') {
        try {
          const qrData = await this.generateQrCode();
          const qrDataUrl = await QRCode.toDataURL(qrData.url, { width: 280, margin: 2 });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ qrDataUrl, qrcodeKey: qrData.qrcodeKey }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: (e as Error).message }));
        }

      } else if (req.url === '/api/bilibili/qr-check' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const { qrcodeKey } = JSON.parse(body);
            const result = await this.pollQrCode(qrcodeKey);
            // cookie已在pollQrCode中保存，这里只需返回状态
            const apiCode = result.status === 0 ? 0 : result.status === 1 ? 1 : result.status === 3 ? 86101 : result.status === 2 ? 86038 : -1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: apiCode, message: result.message }));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, message: (e as Error).message }));
          }
        });

      } else if (req.url === '/api/bilibili/qr-close' && req.method === 'POST') {
        this.stopQrLoginServer();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));

      } else if (req.url === '/api/bilibili/current-user' && req.method === 'GET') {
        // 获取当前登录用户信息
        this.request('https://api.bilibili.com/x/web-interface/nav').then(async (navData: any) => {
          if (navData?.data?.isLogin) {
            const d = navData.data;
            // 从relation/stat获取关注和粉丝数
            let following = 0, follower = 0;
            try {
              const statData = await this.request('https://api.bilibili.com/x/relation/stat', { vmid: d.mid });
              following = statData?.data?.following || 0;
              follower = statData?.data?.follower || 0;
            } catch (e) { /* 忽略 */ }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              isLogin: true,
              mid: d.mid,
              uname: d.uname,
              face: d.face,
              level: d.level_info?.current_level || 0,
              coins: d.money || 0,
              following,
              follower,
              sign: d.sign || '',
            }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ isLogin: false }));
          }
        }).catch((e: any) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ isLogin: false, error: e.message }));
        });

      } else if (req.url?.startsWith('/api/bilibili/avatar-proxy') && req.method === 'GET') {
        // 代理头像图片，绕过跨域限制
        const url = new URL(req.url, 'http://localhost');
        const avatarUrl = url.searchParams.get('url');
        if (!avatarUrl || !avatarUrl.startsWith('http')) {
          res.writeHead(400); res.end('Bad url'); return;
        }
        try {
          const resp = await fetch(avatarUrl, {
            headers: { 'Referer': 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
          });
          if (!resp.ok) { res.writeHead(resp.status); res.end(); return; }
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          });
          const buffer = Buffer.from(await resp.arrayBuffer());
          res.end(buffer);
        } catch (e) {
          res.writeHead(502); res.end('Proxy error');
        }

      } else if (req.url === '/api/bilibili/logout' && req.method === 'POST') {
        // 退出登录
        this.clearCookie();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '已退出登录' }));

      } else if (req.url === '/api/bilibili/cookie-set' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { cookie } = JSON.parse(body);
            if (!cookie || typeof cookie !== 'string' || cookie.trim().length === 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, message: 'Cookie不能为空' }));
              return;
            }
            this.setCookie(cookie.trim());
            // 验证Cookie是否有效
            this.request('https://api.bilibili.com/x/web-interface/nav').then((navData: any) => {
              if (navData?.data?.isLogin) {
                const uname = navData.data.uname || '未知用户';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `登录成功！欢迎 ${uname}` }));
              } else {
                this.clearCookie();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Cookie无效或已过期' }));
              }
            }).catch(() => {
              // 即使验证失败，也先保存Cookie（可能只是网络问题）
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Cookie已保存，但无法验证有效性' }));
            });
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Cookie格式错误' }));
          }
        });

      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(8031, '0.0.0.0');
    (this as any)._qrServer = server;

    const timer = setTimeout(() => {
      this.stopQrLoginServer();
    }, TIMEOUT);
    (this as any)._qrTimer = timer;

    return { port: 8031, url: 'http://localhost:8031' };
  }

  /** 停止二维码登录服务 */
  stopQrLoginServer(): void {
    if ((this as any)._qrServer) {
      (this as any)._qrServer.close();
      (this as any)._qrServer = null;
    }
    if ((this as any)._qrPollTimer) {
      clearInterval((this as any)._qrPollTimer);
      (this as any)._qrPollTimer = null;
    }
    if ((this as any)._qrTimer) {
      clearTimeout((this as any)._qrTimer);
      (this as any)._qrTimer = null;
    }
  }

  /** 从完整的Set-Cookie字符串中提取并保存 */
  saveCookieFromString(cookieStr: string): boolean {
    try {
      // 解析Set-Cookie格式：key=value; path=/; domain=.bilibili.com
      const cookies = cookieStr.split(',').map(s => s.trim()).join('; ');
      // 提取关键cookie字段
      const fields: string[] = [];
      const parts = cookies.split(';');
      for (const part of parts) {
        const kv = part.trim();
        if (kv.includes('=')) {
          const key = kv.split('=')[0].trim();
          if (['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'buvid3', 'buvid4'].includes(key)) {
            fields.push(kv);
          }
        }
      }
      if (fields.length > 0) {
        this.setCookie(fields.join('; '));
        return true;
      }
      // 如果无法解析关键字段，保存原始字符串
      this.setCookie(cookieStr);
      return true;
    } catch (e) {
      return false;
    }
  }
}
