/**
 * dsh-bilibili-search 插件主入口
 *
 * 功能：
 * - B站视频搜索、详情、评论
 * - 封面图 + 字幕分析
 * - 推荐视频列表
 * - 智能视频分析（URL/BV号）
 * - 用户数据（收藏、历史、关注）
 * - 用户操作（点赞、投币、收藏、关注）
 * - 视频下载（音视频合成）
 * - 用户习惯分析
 * - Cookie/二维码登录
 */

import { BilibiliAPI, getWorkspaceDir } from './bilibili-api.js';
import { VideoDownloader } from './video-downloader.js';
import { homedir } from 'os';
import { join } from 'path';

export const name = 'dsh-bilibili-search';
export const inject = ['tools'];

// ========== 全局实例 ==========

let bilibiliAPI: BilibiliAPI | null = null;

function getAPI(): BilibiliAPI {
  if (!bilibiliAPI) {
    bilibiliAPI = new BilibiliAPI();
  }
  return bilibiliAPI;
}

// ========== 工具注册 ==========

export function apply(ctx: any) {

  // 注册webServer路由 - 登录页面（条件注入，不阻塞插件启动）
  ctx.inject(["webserver"], (wctx: any) => {
    // 登录页面HTML
    const loginPageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>B站登录 - DSH Bilibili Search</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 480px; margin: 40px auto; padding: 0 20px; }
    .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; margin-bottom: 8px; color: #00a1d6; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 20px; }
    .tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid #eee; }
    .tab { flex: 1; padding: 10px; text-align: center; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .tab.active { color: #00a1d6; border-bottom-color: #00a1d6; font-weight: 600; }
    .tab:hover { color: #00a1d6; }
    .panel { display: none; }
    .panel.active { display: block; }
    .qr-container { text-align: center; padding: 20px; }
    .qr-img { max-width: 280px; margin: 16px auto; display: block; border: 1px solid #eee; border-radius: 8px; }
    .btn { display: block; width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; margin-top: 12px; transition: all 0.2s; }
    .btn-primary { background: #00a1d6; color: #fff; }
    .btn-primary:hover { background: #0095c8; }
    .btn-primary:disabled { background: #ccc; cursor: not-allowed; }
    .status { padding: 10px; border-radius: 6px; margin-top: 12px; font-size: 14px; text-align: center; }
    .status.success { background: #f0f9f0; color: #2e7d32; }
    .status.error { background: #fff3f0; color: #c62828; }
    .status.info { background: #f0f4ff; color: #1565c0; }
    textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; font-family: monospace; resize: vertical; min-height: 80px; }
    label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #333; }
    .hint { font-size: 12px; color: #999; margin-top: 8px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>📺 B站登录</h1>
      <p class="subtitle">登录后可使用点赞、投币、收藏等需要账号的功能</p>
      <div class="tab-bar">
        <div class="tab active" onclick="switchTab('qr')">扫码登录</div>
        <div class="tab" onclick="switchTab('cookie')">Cookie登录</div>
      </div>
      <div id="qr-panel" class="panel active">
        <div class="qr-container">
          <div id="qr-status" class="status info">点击下方按钮生成二维码</div>
          <img id="qr-img" class="qr-img" style="display:none" />
          <button class="btn btn-primary" id="qr-btn" onclick="generateQR()">生成登录二维码</button>
        </div>
      </div>
      <div id="cookie-panel" class="panel">
        <label for="cookie-input">粘贴Cookie</label>
        <textarea id="cookie-input" placeholder="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"></textarea>
        <p class="hint">从浏览器F12 → Application → Cookies → bilibili.com 复制全部Cookie</p>
        <button class="btn btn-primary" onclick="setCookie()">保存Cookie</button>
        <div id="cookie-status"></div>
      </div>
    </div>
  </div>
  <script>
    let qrKey = null;
    let pollTimer = null;
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', (name==='qr'?i===0:i===1)));
      document.getElementById('qr-panel').classList.toggle('active', name==='qr');
      document.getElementById('cookie-panel').classList.toggle('active', name==='cookie');
    }
    async function generateQR() {
      const btn = document.getElementById('qr-btn');
      const status = document.getElementById('qr-status');
      const img = document.getElementById('qr-img');
      btn.disabled = true; btn.textContent = '生成中...';
      try {
        const res = await fetch('/api/bilibili/qr-generate');
        const data = await res.json();
        if (data.code === 0) {
          qrKey = data.qrcodeKey;
          img.src = data.qrImageUrl; img.style.display = 'block';
          status.className = 'status info'; status.textContent = '请使用B站APP扫描二维码';
          btn.textContent = '刷新二维码';
          startPolling();
        } else {
          status.className = 'status error'; status.textContent = '生成失败：' + data.message;
        }
      } catch(e) { status.className = 'status error'; status.textContent = '网络错误'; }
      btn.disabled = false;
    }
    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(async () => {
        if (!qrKey) return;
        const status = document.getElementById('qr-status');
        try {
          const res = await fetch('/api/bilibili/qr-check', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ qrcodeKey: qrKey })
          });
          const data = await res.json();
          if (data.code === 0) {
            status.className = 'status success'; status.textContent = '✅ ' + data.message;
            clearInterval(pollTimer);
          } else if (data.code === 1) {
            status.className = 'status info'; status.textContent = '⏳ ' + data.message;
          } else {
            status.className = 'status error'; status.textContent = '❌ ' + data.message;
            clearInterval(pollTimer); qrKey = null;
          }
        } catch(e) { /* 继续轮询 */ }
      }, 2000);
    }
    async function setCookie() {
      const input = document.getElementById('cookie-input');
      const status = document.getElementById('cookie-status');
      try {
        const res = await fetch('/api/bilibili/set-cookie', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ cookie: input.value })
        });
        const data = await res.json();
        status.innerHTML = data.code === 0
          ? '<div class="status success">' + data.message + '</div>'
          : '<div class="status error">' + data.message + '</div>';
      } catch(e) { status.innerHTML = '<div class="status error">网络错误</div>'; }
    }
  </script>
</body>
</html>`;

    // 路由：登录页面
    wctx.webserver.addRoute('/bilibili-login', {
      method: 'GET',
      handler: (_req: any, res: any) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(loginPageHtml);
      },
    });

    // API：生成二维码
    wctx.webserver.addRoute('/api/bilibili/qr-generate', {
      method: 'GET',
      handler: async (_req: any, res: any) => {
        try {
          const api = getAPI();
          const result = await api.generateQrCode();
          const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(result.url)}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, url: result.url, qrcodeKey: result.qrcodeKey, qrImageUrl }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, message: (e as Error).message }));
        }
      },
    });

    // API：轮询二维码状态
    wctx.webserver.addRoute('/api/bilibili/qr-check', {
      method: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const api = getAPI();
          let body = '';
          await new Promise<void>((resolve) => {
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', resolve);
          });
          const { qrcodeKey } = JSON.parse(body);
          const result = await api.pollQrCode(qrcodeKey);
          const apiCode = result.status === 0 ? 0 : result.status === 1 ? 1 : -1;

          // 登录成功时保存cookie
          if (result.status === 0 && result.cookie) {
            api.saveCookieFromString(result.cookie);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: apiCode, message: result.message }));
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, message: (e as Error).message }));
        }
      },
    });

    // API：设置Cookie
    wctx.webserver.addRoute('/api/bilibili/set-cookie', {
      method: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const api = getAPI();
          let body = '';
          await new Promise<void>((resolve) => {
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', resolve);
          });
          const { cookie } = JSON.parse(body);
          if (!cookie || typeof cookie !== 'string') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, message: '请提供有效的Cookie字符串' }));
            return;
          }
          const success = api.saveCookieFromString(cookie);
          if (success) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 0, message: '✅ Cookie设置成功！现在可以使用需要登录的功能。' }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: -1, message: '❌ Cookie格式解析失败' }));
          }
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: -1, message: (e as Error).message }));
        }
      },
    });

  });

  // ==================== 搜索 ====================

  ctx.tools.register({
    name: 'bilibili_search',
    description: '搜索哔哩哔哩视频，返回视频列表（标题、UP主、播放量等）。\n参数：keyword(必填)=搜索关键词字符串；page(选填)=页码，默认1；pageSize(选填)=每页数量，默认20',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        page: { type: 'number', description: '页码，默认1' },
        pageSize: { type: 'number', description: '每页数量，默认20' },
      },
      required: ['keyword'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          result: { type: 'array', items: { type: 'object' } },
          verifyTags: { type: 'object', description: 'mid→认证标签映射' },
        },
      },
      render: (_args: any, value: any) => {
        const videos: any[] = [];
        const tags: Record<number, string> = value?.verifyTags || {};
        const staffMap: Record<string, any[]> = value?.staffMap || {};
        if (value?.result) {
          for (const group of value.result) {
            if (group.data_type === 'video' || group.result_type === 'video') {
              for (const item of (group.data || [])) {
                if (item.bvid) videos.push(item);
              }
            }
          }
        }
        if (videos.length === 0 && Array.isArray(value?.result)) {
          for (const item of value.result) {
            if (item.bvid) videos.push(item);
          }
        }
        return [{
          type: 'text',
          text: `搜索结果：共${videos.length}条视频\n`
            + videos.map((v: any, i: number) => {
              const tag = tags[v.mid] || '';
              const staff = staffMap[v.bvid] || [];
              let coopTag = '';
              if (staff.length > 1) {
                if (String(staff[0].mid) === String(v.mid)) {
                  coopTag = ' [合作视频]';
                } else {
                  coopTag = ` [关联UP主: ${staff[0].name}]`;
                }
              }
              return `${i + 1}. ${v.title?.replace(/<[^>]+>/g, '') || '无标题'} - ${v.author}${tag}${coopTag} (${v.play || 0}播放) [${v.bvid}]`;
            }).join('\n'),
        }];
      },
    },
    async execute(args: { keyword: string; page?: number; pageSize?: number }) {
      const api = getAPI();
      const searchResult = await api.search(args);
      // 收集所有不重复的mid和bvid，批量查询认证标签和合作信息
      const mids: number[] = [];
      const bvids: string[] = [];
      if (searchResult?.result) {
        for (const group of searchResult.result) {
          const items = group.data || searchResult.result;
          for (const item of (Array.isArray(items) ? items : [])) {
            if (item.mid) mids.push(item.mid);
            if (item.bvid) bvids.push(item.bvid);
          }
        }
      }
      // 并行查询认证标签和合作信息
      const verifyTags = await api.getVerifyTags(mids);
      const staffMap: Record<string, any[]> = {};
      // 批量获取合作信息（限制并发，避免过多请求）
      const staffPromises = bvids.slice(0, 10).map(async (bvid) => {
        try {
          const detail = await api.getVideoDetail(bvid);
          if (detail.staff && detail.staff.length > 1) {
            staffMap[bvid] = detail.staff.map((s: any) => ({ mid: s.mid, name: s.name, title: s.title }));
          }
        } catch (e) { /* 忽略 */ }
      });
      await Promise.all(staffPromises);
      // 转为普通对象以便序列化
      const tagsObj: Record<number, string> = {};
      verifyTags.forEach((v, k) => { tagsObj[k] = v; });
      return { ...searchResult, verifyTags: tagsObj, staffMap };
    },
  });

  // ==================== 搜索UP主 ====================

  ctx.tools.register({
    name: 'bilibili_search_user',
    description: '搜索哔哩哔哩UP主/用户，返回用户列表（UID、昵称、粉丝数、签名等）。\n参数：keyword(必填)=搜索关键词（UP主名或相关词）；page(选填)=页码，默认1',
    parameters: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词（UP主名或相关词）' },
        page: { type: 'number', description: '页码，默认1' },
      },
      required: ['keyword'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          users: { type: 'array' },
        },
      },
      render: (_args: any, value: any) => {
        const users: any[] = value?.users || [];
        if (users.length === 0) {
          return [{ type: 'text', text: '未找到相关UP主' }];
        }
        return [{
          type: 'text',
          text: `搜索结果：共${users.length}位UP主\n`
            + users.map((u: any, i: number) => {
              const ov = u.official_verify;
              const vTag = ov?.type === 0 ? ' (黄V)' : ov?.type === 1 ? ' (蓝V)' : '';
              return `${i + 1}. ${u.uname}${vTag} (UID:${u.mid}) - 粉丝:${u.fans || 0} | ${u.usign || '无签名'}`;
            }).join('\n'),
        }];
      },
    },
    async execute(args: { keyword: string; page?: number }) {
      const api = getAPI();
      const result = await api.searchUsers(args.keyword, args.page || 1);
      return { users: result };
    },
  });

  // ==================== 短链接解析 ====================

  ctx.tools.register({
    name: 'bilibili_resolve_url',
    description: '解析B站短链接（b23.tv）或视频链接，提取BV号。\n参数：url(必填)=B站视频链接（支持b23.tv短链、bilibili.com/video/BVxxx等格式）',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'B站视频链接（支持b23.tv短链、bilibili.com/video/BVxxx 等格式）' },
      },
      required: ['url'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          bvid: { type: 'string' },
          title: { type: 'string' },
          author: { type: 'string' },
        },
      },
      render: (_args: any, value: any) => {
        if (value.bvid) {
          return [{ type: 'text', text: `视频信息：\n标题：${value.title || '未知'}\nUP主：${value.author || '未知'}\nBV号：${value.bvid}` }];
        }
        return [{ type: 'text', text: '❌ 无法解析该链接' }];
      },
    },
    async execute(args: { url: string }) {
      const api = getAPI();
      // 提取BV号
      let bvid = BilibiliAPI.extractBvid(args.url);
      // 如果没有直接提取到，尝试解析短链接
      if (!bvid && (args.url.includes('b23.tv') || args.url.includes('bilibili.com'))) {
        try {
          const resp = await api['axios'].get(args.url, {
            maxRedirects: 5,
            validateStatus: () => true,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          const finalUrl = resp.request?.res?.responseUrl || resp.headers?.location || '';
          bvid = BilibiliAPI.extractBvid(finalUrl) || BilibiliAPI.extractBvid(args.url);
        } catch (e) {
          bvid = BilibiliAPI.extractBvid(args.url);
        }
      }
      if (!bvid) return { bvid: '', title: '', author: '' };
      try {
        const detail = await api.getVideoDetail(bvid);
        return { bvid, title: detail.title, author: detail.owner?.name || '' };
      } catch (e) {
        return { bvid, title: '', author: '' };
      }
    },
  });

  // ==================== 获取字幕 ====================

  ctx.tools.register({
    name: 'bilibili_get_subtitles',
    description: '获取B站视频的字幕内容。\n参数：bvid(必填)=视频BV号或B站链接（支持完整URL和BV号）。\nAI字幕(lan以ai-开头)可能有同音字错误需结合上下文判断；手打字幕(lan不含ai-)识别准确。仅英文时说明视频有硬字幕，B站未生成中文AI字幕。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号或B站链接' },
      },
      required: ['bvid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitleCount: { type: 'number' },
          fullText: { type: 'string' },
          isAI: { type: 'boolean' },
          subtitleType: { type: 'string' },
        },
      },
      render: (_args: any, value: any) => {
        if (!value.fullText) {
          return [{ type: 'text', text: `📺 ${value.title || '未知'}\n\n❌ 该视频没有可用字幕` }];
        }
        const warn = value.isEnglishOnly
          ? '\n⚠️ 该视频仅有英文字幕。可能原因：UP主在视频中烧入了中文字幕（硬字幕），B站AI检测到后不再生成中文AI字幕，仅生成英文AI字幕。'
          : value.isAI
            ? '\n⚠️ 以上为AI语音识别字幕，可能存在同音字/近似读音的识别错误，分析时请结合上下文语境推断。'
            : '\n✅ 该字幕为UP主手打字幕，放心识别。';
        return [{
          type: 'text',
          text: `📺 ${value.title}\n字幕类型：${value.subtitleType}（${value.subtitleCount}条）\n\n📝 字幕全文：\n${value.fullText}${warn}`,
        }];
      },
    },
    async execute(args: { bvid: string }) {
      const api = getAPI();
      let bvid = BilibiliAPI.extractBvid(args.bvid) || args.bvid;
      // 获取视频信息
      let title = '';
      try {
        const detail = await api.getVideoDetail(bvid);
        title = detail.title;
      } catch (e) { /* 忽略 */ }
      // 获取字幕列表
      const subtitles = await api.getSubtitle(bvid);
      if (!subtitles || subtitles.length === 0) {
        return { title, subtitleCount: 0, fullText: '', isAI: false, subtitleType: '无字幕', isEnglishOnly: false };
      }
      // 判断字幕类型：lan字段以"ai-"开头为AI字幕
      const sub = subtitles[0];
      const isAI = (sub.lan || '').startsWith('ai-');
      const subtitleType = isAI ? 'AI语音识别字幕' : 'UP主手打字幕';
      // 检查是否只有英文字幕
      const isEnglishOnly = subtitles.every((s: any) => s.lan?.startsWith('ai-en'));
      // 获取字幕内容
      const subUrl = sub.subtitle_url?.startsWith('http') ? sub.subtitle_url : `https:${sub.subtitle_url}`;
      const content = await api.getSubtitleContent(subUrl);
      const fullText = content.map((item: any) => item.content || '').join('');
      return { title, subtitleCount: content.length, fullText, isAI, subtitleType, isEnglishOnly };
    },
  });

  // ==================== 视频详情 ====================

  ctx.tools.register({
    name: 'bilibili_video_detail',
    description: '获取哔哩哔哩视频详情（标题、简介、播放/点赞/投币/收藏/弹幕/评论数据）。\n参数：bvid(必填)=视频BV号',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
      },
      required: ['bvid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          owner: { type: 'object' },
          stat: { type: 'object' },
        },
      },
      render: (_args: any, value: any) => {
        const ownerName = value.owner?.name || '未知';
        const vTag = value._verifyTag || '';
        const staff = value.staff || [];
        let coopInfo = '';
        if (staff.length > 1) {
          const members = staff.map((s: any) => `${s.name}(${s.title})`).join('、');
          coopInfo = `\n🤝 合作视频：${members}`;
        }
        return [{
          type: 'text',
          text: `标题：${value.title}\nUP主：${ownerName}${vTag}${coopInfo}\n播放：${value.stat?.view}\n点赞：${value.stat?.like}\naid：${value.aid || value.id || '未知'}`,
        }];
      },
    },
    async execute(args: { bvid: string }) {
      const api = getAPI();
      const detail = await api.getVideoDetail(args.bvid);
      // 查询UP主认证标签
      if (detail.owner?.mid) {
        const tag = await api.getVerifyTag(detail.owner.mid);
        (detail as any)._verifyTag = tag;
      }
      return detail;
    },
  });

  // ==================== UP主视频列表 ====================

  ctx.tools.register({
    name: 'bilibili_user_videos',
    description: '列出UP主最近发布的视频。\n参数：mid(选填)=UP主UID；username(选填)=UP主用户名（用于搜索，如果传了mid则忽略）。两个参数至少传一个。\ncount(选填)=返回数量，默认10。合作视频会标注[合作视频]及关联UP主。',
    parameters: {
      type: 'object',
      properties: {
        mid: { type: 'number', description: 'UP主UID' },
        username: { type: 'string', description: 'UP主用户名（用于搜索，如果传了mid则忽略）' },
        count: { type: 'number', description: '返回数量，默认10' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          mid: { type: 'number' },
          uname: { type: 'string' },
          count: { type: 'number' },
          videos: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const videos = value.videos || [];
        const vTag = value._verifyTag || '';
        const staffMap: Record<string, any[]> = value._staffMap || {};
        if (videos.length === 0) return [{ type: 'text', text: `❌ UP主 ${value.uname || '未知'}${vTag} 没有视频` }];
        const text = videos.map((v: any, i: number) => {
          const date = v.created ? new Date(v.created * 1000).toLocaleDateString('zh-CN') : '';
          const staff = staffMap[v.bvid] || [];
          let coopTag = '';
          if (staff.length > 1) {
            if (String(staff[0].mid) === String(value.mid)) {
              coopTag = ' [合作视频]';
            } else {
              coopTag = ` [关联UP主: ${staff[0].name}]`;
            }
          }
          return `${i + 1}. ${v.title}${coopTag}\n   BV号：${v.bvid} | 播放：${v.stat?.view || v.play || 0} | ${date}`;
        }).join('\n');
        return [{ type: 'text', text: `📹 ${value.uname}${vTag} 的最近${value.count}条视频：\n${text}` }];
      },
    },
    async execute(args: { mid?: number; username?: string; count?: number }) {
      const api = getAPI();
      let mid = args.mid;
      if (!mid && args.username) {
        const users = await api.searchUsers(args.username, 1);
        if (users.length > 0) {
          mid = users[0].mid;
        } else {
          return { mid: 0, uname: args.username, count: 0, videos: [] };
        }
      }
      if (!mid) throw new Error('请提供UP主的mid或username');
      const count = args.count || 10;
      const [videos, verifyTag] = await Promise.all([
        api.getUserVideos(mid, count),
        api.getVerifyTag(mid),
      ]);
      // 获取合作信息
      const staffMap: Record<string, any[]> = {};
      const staffPromises = videos.slice(0, count).map(async (v: any) => {
        try {
          const detail = await api.getVideoDetail(v.bvid);
          if (detail.staff && detail.staff.length > 1) {
            staffMap[v.bvid] = detail.staff.map((s: any) => ({ mid: s.mid, name: s.name, title: s.title }));
          }
        } catch (e) { /* 忽略 */ }
      });
      await Promise.all(staffPromises);
      // 获取UP主名称
      let uname = args.username || String(mid);
      try {
        const userInfo = await api.getUserInfo(mid);
        if (userInfo.name) uname = userInfo.name;
      } catch (e) { /* 忽略 */ }
      return { mid, uname, count: videos.length, videos, _verifyTag: verifyTag, _staffMap: staffMap };
    },
  });

  // ==================== 评论 ====================

  ctx.tools.register({
    name: 'bilibili_comments',
    description: '获取哔哩哔哩视频评论区内容。\n参数：bvid(选填)=视频BV号（优先使用）；oid(选填)=视频AV号（aid），如果没有传bvid则使用此值。\nnext(选填)=翻页参数，默认0。至少传bvid或oid之一。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号（优先使用）' },
        oid: { type: 'number', description: '视频AV号（aid），如果没有传bvid则使用此值' },
        next: { type: 'number', description: '翻页参数，默认0' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          replies: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => [{
        type: 'text',
        text: `评论数量：${(value.replies || []).length}\n`
          + (value.replies || []).slice(0, 10).map((r: any) =>
            `${r.member?.uname}: ${r.content?.message}`
          ).join('\n'),
      }],
    },
    async execute(args: { bvid?: string; oid?: number; next?: number }) {
      const api = getAPI();
      let oid = args.oid;
      if (args.bvid && !oid) {
        const detail = await api.getVideoDetail(args.bvid);
        oid = detail.aid || detail.id;
      }
      if (!oid) throw new Error('请提供bvid或oid参数');
      return await api.getComments(oid, args.next);
    },
  });

  // ==================== 用户信息 ====================

  ctx.tools.register({
    name: 'bilibili_user_info',
    description: '获取哔哩哔哩UP主信息（昵称、头像、等级、粉丝数、关注数、签名、认证类型等）。\n参数：mid(必填)=用户UID。蓝V认证显示[蓝V]，黄V认证显示[黄V]。',
    parameters: {
      type: 'object',
      properties: {
        mid: { type: 'number', description: '用户UID' },
      },
      required: ['mid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          fans: { type: 'number' },
        },
      },
      render: (_args: any, value: any) => {
        const vTag = value._verifyTag || '';
        return [{
          type: 'text',
          text: `昵称：${value.name}${vTag}\n粉丝：${value.fans || 0}\n签名：${value.sign || '无'}`,
        }];
      },
    },
    async execute(args: { mid: number }) {
      const api = getAPI();
      const info = await api.getUserInfo(args.mid);
      const tag = await api.getVerifyTag(args.mid);
      (info as any)._verifyTag = tag;
      return info;
    },
  });

  // ==================== 完整分析 ====================

  ctx.tools.register({
    name: 'bilibili_full_analysis',
    description: '获取B站视频的字幕和封面图，用于分析视频内容。\n参数：bvid(必填)=视频BV号',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
      },
      required: ['bvid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          owner: { type: 'object' },
          stat: { type: 'object' },
          hasSubtitle: { type: 'boolean' },
          subtitleList: { type: 'array' },
          subtitleContent: { type: 'array' },
        },
      },
      render: (_args: any, value: any) => {
        const parts: string[] = [
          `标题：${value.title}`,
          `UP主：${value.owner?.name || '未知'}`,
          `播放：${value.stat?.view || 0} | 点赞：${value.stat?.like || 0}`,
        ];
        if (value.hasSubtitle && value.subtitleList?.length > 0) {
          parts.push(`字幕：共${value.subtitleList.length}条`);
          for (const sub of value.subtitleList.slice(0, 3)) {
            parts.push(`  - ${sub.lanDoc || sub.lan}`);
          }
        } else {
          parts.push('字幕：无');
        }
        if (value.cover) parts.push(`封面：${value.cover}`);
        return [{ type: 'text', text: parts.join('\n') }];
      },
    },
    async execute(args: { bvid: string }) {
      const api = getAPI();
      const detail = await api.getVideoDetail(args.bvid);
      let subtitleData: any = { hasSubtitle: false, subtitleList: [], content: [] };
      try {
        subtitleData = await api.getFullSubtitle(args.bvid, detail.cid);
      } catch (e) { /* 字幕获取失败可忽略 */ }
      return {
        title: detail.title,
        desc: detail.desc,
        owner: detail.owner,
        stat: detail.stat,
        cover: detail.pic,
        cid: detail.cid,
        hasSubtitle: subtitleData.hasSubtitle,
        subtitleList: subtitleData.subtitleList || [],
        subtitleContent: (subtitleData.content || []).slice(0, 50),
      };
    },
  });

  // ==================== 推荐列表 ====================

  ctx.tools.register({
    name: 'bilibili_recommend',
    description: '获取B站首页推荐视频列表。无需任何参数。蓝V/黄V认证作者会标注[蓝V]/[黄V]。',
    parameters: {
      type: 'object',
      properties: {},
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const items = value?.items || [];
        return [{
          type: 'text',
          text: `推荐视频：\n`
            + items.slice(0, 10).map((v: any, i: number) =>
              `${i + 1}. ${v.title} - ${v.author} (${v.play}播放)`
            ).join('\n'),
        }];
      },
    },
    async execute() {
      const api = getAPI();
      const raw = await api.getRecommend();
      return {
        items: raw.map((item: any) => ({
          bvid: item.bvid,
          title: item.title,
          author: item.owner?.name || '',
          cover: item.pic,
          play: item.stat?.view || 0,
          danmaku: item.stat?.danmaku || 0,
          duration: item.duration,
          desc: item.desc || '',
          reason: item.reason || '',
          url: `https://www.bilibili.com/video/${item.bvid}`,
        })),
      };
    },
  });

  // ==================== 智能分析视频 ====================

  ctx.tools.register({
    name: 'bilibili_analyze_video',
    description: '智能分析B站视频，支持输入URL或BV号，自动提取字幕和详情。\n参数：input(必填)=视频URL或BV号',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string', description: '视频URL或BV号' },
      },
      required: ['input'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          cover: { type: 'string' },
          hasSubtitle: { type: 'boolean' },
          subtitleList: { type: 'array' },
        },
      },
      render: (_args: any, value: any) => {
        const parts: string[] = [
          `标题：${value.title}`,
          `UP主：${value.owner?.name || '未知'}`,
          `播放：${value.stat?.view || 0} | 点赞：${value.stat?.like || 0}`,
        ];
        if (value.hasSubtitle && value.subtitleList?.length > 0) {
          parts.push(`字幕：共${value.subtitleList.length}条`);
        } else {
          parts.push('字幕：无');
        }
        return [{ type: 'text', text: parts.join('\n') }];
      },
    },
    async execute(args: { input: string }) {
      const api = getAPI();
      const bvid = BilibiliAPI.extractBvid(args.input);
      const detail = await api.getVideoDetail(bvid);
      let subtitleData: any = { hasSubtitle: false, subtitleList: [], content: [] };
      try {
        subtitleData = await api.getFullSubtitle(bvid, detail.cid);
      } catch (e) { /* 忽略 */ }
      return {
        title: detail.title,
        desc: detail.desc,
        owner: detail.owner,
        stat: detail.stat,
        cover: detail.pic,
        bvid,
        cid: detail.cid,
        hasSubtitle: subtitleData.hasSubtitle,
        subtitleList: subtitleData.subtitleList || [],
      };
    },
  });

  // ==================== 用户数据 ====================

  ctx.tools.register({
    name: 'bilibili_user_favorites',
    description: '获取用户收藏夹列表（需要登录）。\n参数：upMid(选填)=UP主UID，不传则默认获取当前登录用户的收藏夹。返回收藏夹名称和视频数量。',
    parameters: {
      type: 'object',
      properties: {
        upMid: { type: 'number', description: 'UP主UID，不传则默认获取当前登录用户' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const folders = value.list || [];
        return [{
          type: 'text',
          text: folders.length === 0 ? '无收藏夹'
            : `收藏夹列表（共${folders.length}个）：\n`
              + folders.map((f: any, i: number) =>
                `${i + 1}. ${f.title} (${f.media_count || 0}个视频)`
              ).join('\n'),
        }];
      },
    },
    async execute(args: { upMid?: number }) {
      const api = getAPI();
      try {
        const list = await api.getFavoriteFolders(args.upMid);
        return { list };
      } catch (e: any) {
        return { list: [], error: e.message };
      }
    },
  });

  ctx.tools.register({
    name: 'bilibili_user_history',
    description: '获取用户观看历史记录（需要登录）。\n参数：count(选填)=要获取的历史记录条数，默认10，最大约200。\ncount<=20直接获取；count>20自动翻页获取。显示标题、分类标签、UP主名。',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '要获取的历史记录条数，默认10，最大约200' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const total = (value.list || []).length;
        const items = (value.list || []).slice(0, 20);
        return [{
          type: 'text',
          text: `历史记录（共${total}条，显示前${items.length}条）：\n`
            + items.map((h: any, i: number) =>
              `${i + 1}. ${h.title || h.bvid}${h.tag_name ? ' [' + h.tag_name + ']' : ''}${h.author_name ? ' UP:' + h.author_name : ''}`
            ).join('\n') || '无历史记录',
        }];
      },
    },
    async execute(args: { count?: number }) {
      const api = getAPI();
      const count = args.count || 10;
      if (count <= 20) {
        // 少量直接获取
        const result = await api.request('https://api.bilibili.com/x/v2/history', {});
        const list = (result.data || []).slice(0, count);
        return { list };
      } else {
        // 大量使用cursor翻页
        const list = await api.getHistoryMore(count);
        return { list };
      }
    },
  });

  ctx.tools.register({
    name: 'bilibili_user_follows',
    description: '获取用户关注的所有UP主列表（自动翻页，一次返回全部）。需要登录。\n参数：vmId(选填)=用户UID，不传则默认获取当前登录用户的关注列表。',
    parameters: {
      type: 'object',
      properties: {
        vmId: { type: 'number', description: '用户UID，不传则默认获取当前登录用户' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          total: { type: 'number' },
          list: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const list = value.list || [];
        const text = list.slice(0, 50).map((u: any, i: number) => `${i + 1}. ${u.uname} (${u.mid})`).join('\n');
        return [{
          type: 'text',
          text: `关注列表（共${value.total || list.length}人）：\n${text}${list.length > 50 ? `\n...还有${list.length - 50}人` : ''}`,
        }];
      },
    },
    async execute(args: { vmId?: number }) {
      const api = getAPI();
      let vmId = args.vmId;
      if (!vmId) {
        const nav = await api.getNavInfo();
        vmId = nav.mid;
      }
      if (!vmId) throw new Error('未登录，请先扫码登录');
      return await api.getFollowings(vmId, true);
    },
  });

  // ==================== 消息（需要登录） ====================

  ctx.tools.register({
    name: 'bilibili_unread_count',
    description: '获取B站未读消息数量（回复、@、点赞、系统通知等）。需要登录。无需任何参数。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        properties: {
          reply: { type: 'number', description: '回复我的' },
          at: { type: 'number', description: '@我的' },
          like: { type: 'number', description: '收到的赞' },
          system: { type: 'number', description: '系统通知' },
          total: { type: 'number', description: '总未读数' },
        },
      },
      render: (_args: any, value: any) => {
        const items = [
          value.reply ? `💬 回复我的: ${value.reply}` : null,
          value.at ? `📢 @我的: ${value.at}` : null,
          value.like ? `👍 收到的赞: ${value.like}` : null,
          value.system ? `🔔 系统通知: ${value.system}` : null,
        ].filter(Boolean);
        const total = (value.reply || 0) + (value.at || 0) + (value.like || 0) + (value.system || 0);
        if (items.length === 0) return [{ type: 'text', text: '📭 没有未读消息' }];
        return [{ type: 'text', text: `📬 未读消息（共${total}条）：\n${items.join('\n')}` }];
      },
    },
    async execute() {
      const api = getAPI();
      return await api.getUnreadCount();
    },
  });

  ctx.tools.register({
    name: 'bilibili_messages',
    description: '获取B站消息列表。需要登录。\n参数：type(选填)=消息类型，默认返回最近消息。\ntype枚举值：reply=回复我的, at=@我的, like=收到的赞, system=系统通知。\npage(选填)=页码，默认1。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['reply', 'at', 'like', 'system'], description: '消息类型：reply=回复我的, at=@我的, like=收到的赞, system=系统通知' },
        page: { type: 'number', description: '页码，默认1' },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          count: { type: 'number' },
          messages: { type: 'array', items: { type: 'object' } },
        },
      },
      render: (_args: any, value: any) => {
        const msgs = value.messages || [];
        if (msgs.length === 0) return [{ type: 'text', text: `📭 没有${value.type}消息` }];
        const typeNames: Record<string, string> = { reply: '💬 回复我的', at: '📢 @我的', like: '👍 收到的赞', system: '🔔 系统通知' };
        const text = msgs.slice(0, 15).map((m: any) => {
          if (m.user) return `• ${m.user} ${m.action || ''} ${m.content || ''} ${m.time || ''}`;
          if (m.title) return `• ${m.title} ${m.content || ''} ${m.time || ''}`;
          return `• ${JSON.stringify(m).substring(0, 80)}`;
        }).join('\n');
        return [{ type: 'text', text: `${typeNames[value.type] || value.type}（共${value.count}条）：\n${text}` }];
      },
    },
    async execute(args: { type?: string; page?: number }) {
      const api = getAPI();
      const msgType = args.type || 'reply';
      const pn = args.page || 1;
      let data: any;
      switch (msgType) {
        case 'reply': data = await api.getReplyMeMessages(pn); break;
        case 'at': data = await api.getAtMeMessages(pn); break;
        case 'like': data = await api.getLikeMessages(pn); break;
        case 'system': data = await api.getSystemMessages(pn); break;
        default: data = await api.getReplyMeMessages(pn);
      }
      // 解析消息列表
      let messages: any[] = [];
      if (data.items) {
        messages = data.items.map((item: any) => {
          const reply = item.reply || {};
          const user = item.user || {};
          return {
            user: user.nickname || user.nick_name || '',
            action: reply.action || '',
            content: (reply.content || '').substring(0, 100),
            bvid: reply.bvid || '',
            time: item.reply_time ? new Date(item.reply_time * 1000).toLocaleString('zh-CN') : '',
          };
        });
      } else if (data.list) {
        messages = data.list.map((item: any) => ({
          title: item.title || item.feedback_title || '',
          content: (item.content || item.feedback_content || '').substring(0, 100),
          time: item.time ? new Date(item.time * 1000).toLocaleString('zh-CN') : '',
        }));
      }
      return { type: msgType, count: data.total || data.cursor?.all_count || messages.length, messages };
    },
  });

  // ==================== 用户操作（需要登录） ====================

  ctx.tools.register({
    name: 'bilibili_like',
    description: '给哔哩哔哩视频点赞（需要登录）。\n参数：bvid(必填)=视频BV号',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
      },
      required: ['bvid'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { bvid: string }) {
      const api = getAPI();
      const result = await api.like(args.bvid);
      return { success: result, message: result ? '👍 点赞成功' : '❌ 点赞失败' };
    },
  });

  ctx.tools.register({
    name: 'bilibili_unlike',
    description: '取消哔哩哔哩视频点赞（需要登录）。\n参数：bvid(必填)=视频BV号',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
      },
      required: ['bvid'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { bvid: string }) {
      const api = getAPI();
      const result = await api.unlike(args.bvid);
      return { success: result, message: result ? '已取消点赞' : '❌ 取消点赞失败' };
    },
  });

  ctx.tools.register({
    name: 'bilibili_coin',
    description: '给哔哩哔哩视频投币（需要登录）。\n参数：bvid(必填)=视频BV号；multiply(选填)=投币数量（1或2），默认1',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
        multiply: { type: 'number', description: '投币数量（1或2），默认1' },
      },
      required: ['bvid'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { bvid: string; multiply?: number }) {
      const api = getAPI();
      const result = await api.coin(args.bvid, args.multiply || 1);
      return { success: result, message: result ? '🪙 投币成功' : '❌ 投币失败' };
    },
  });

  ctx.tools.register({
    name: 'bilibili_favorite',
    description: '收藏视频到指定收藏夹（需要登录）。\n参数：mediaId(必填)=收藏夹ID（可通过bilibili_user_favorites获取）；\nresources(必填)=资源标识，格式为 bvid:2（冒号后2表示收藏，1表示取消收藏）。',
    parameters: {
      type: 'object',
      properties: {
        mediaId: { type: 'number', description: '收藏夹ID' },
        resources: { type: 'string', description: '资源标识，格式：bvid:2' },
      },
      required: ['mediaId', 'resources'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { mediaId: number; resources: string }) {
      const api = getAPI();
      const result = await api.favorite(args.mediaId, args.resources);
      return { success: result, message: result ? '⭐ 收藏成功' : '❌ 收藏失败' };
    },
  });

  ctx.tools.register({
    name: 'bilibili_follow',
    description: '关注哔哩哔哩UP主（需要登录）。\n参数：mid(必填)=UP主UID',
    parameters: {
      type: 'object',
      properties: {
        mid: { type: 'number', description: 'UP主UID' },
      },
      required: ['mid'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { mid: number }) {
      const api = getAPI();
      const result = await api.follow(args.mid);
      return { success: result, message: result ? '✅ 关注成功' : '❌ 关注失败' };
    },
  });

  ctx.tools.register({
    name: 'bilibili_unfollow',
    description: '取消关注哔哩哔哩UP主（需要登录）。\n参数：mid(必填)=UP主UID',
    parameters: {
      type: 'object',
      properties: {
        mid: { type: 'number', description: 'UP主UID' },
      },
      required: ['mid'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { mid: number }) {
      const api = getAPI();
      const result = await api.unfollow(args.mid);
      return { success: result, message: result ? '已取消关注' : '❌ 取消关注失败' };
    },
  });

  // ==================== 视频流 ====================

  ctx.tools.register({
    name: 'bilibili_get_video_streams',
    description: '获取视频流地址（视频源+音频源）。\n参数：bvid(必填)=视频BV号；cid(选填)=分P的CID，不传默认使用第一个分P。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
        cid: { type: 'number', description: '分P的CID' },
      },
      required: ['bvid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          video: { type: 'array' },
          audio: { type: 'array' },
          duration: { type: 'number' },
        },
      },
      render: (_args: any, value: any) => [{
        type: 'text',
        text: `视频流：\n`
          + `视频流数量：${(value.video || []).length}\n`
          + `音频流数量：${(value.audio || []).length}\n`
          + `时长：${value.duration || 0}秒`,
      }],
    },
    async execute(args: { bvid: string; cid?: number }) {
      const api = getAPI();
      return await api.getVideoStreams(args.bvid, args.cid);
    },
  });

  // ==================== 视频下载 ====================

  ctx.tools.register({
    name: 'bilibili_download_video',
    description: '下载B站视频，自动合成音视频（需要ffmpeg，未安装会自动安装）。\n参数：bvid(必填)=视频BV号；\nquality(选填)=画质ID：127=8K, 120=4K, 80=1080P, 64=720P；\noutputPath(选填)=输出目录，不传默认下载到当前工作区目录。',
    parameters: {
      type: 'object',
      properties: {
        bvid: { type: 'string', description: '视频BV号' },
        quality: { type: 'number', description: '画质ID：127=8K, 120=4K, 80=1080P, 64=720P' },
        outputPath: { type: 'string', description: '输出目录' },
      },
      required: ['bvid'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          path: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (_args: any, value: any) => [{
        type: 'text',
        text: value.success
          ? `✅ 下载完成\n📁 文件：${value.path}`
          : `❌ 下载失败：${value.message}`,
      }],
    },
    async execute(args: { bvid: string; quality?: number; outputPath?: string }) {
      const api = getAPI();
      const cookie = api.getCookie() || '';
      const downloadPath = args.outputPath || getWorkspaceDir();
      const downloader = new VideoDownloader(cookie, downloadPath);
      const result = await downloader.download(args.bvid, args.quality || 80);
      return result;
    },
  });

  // ==================== 用户习惯分析 ====================

  ctx.tools.register({
    name: 'bilibili_analyze_habits',
    description: '综合分析用户的B站观看画像：历史记录(150条+)、推荐页(50条)、收藏夹、稍后再看。需要登录。无需任何参数。\n使用时间衰减权重分析兴趣偏好，收藏和稍后再看权重×1.5。',
    parameters: {
      type: 'object',
      properties: {},
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
      },
      render: (_args: any, value: any) => {
        return [{ type: 'text', text: value.summary || '暂无数据' }];
      },
    },
    async execute() {
      const api = getAPI();
      const now = Math.floor(Date.now() / 1000);

      // 并行获取所有数据
      const [history, recommend, watchLater, favFolders] = await Promise.all([
        api.getHistoryMore(150).catch(() => []),
        api.getRecommend().catch(() => []),
        api.getWatchLater().catch(() => []),
        api.getFavoriteFolders().catch(() => []),
      ]);

      // 获取收藏夹内容（每个收藏夹最多50条）
      let allFavItems: any[] = [];
      for (const folder of favFolders.slice(0, 3)) {
        try {
          const items = await api.getFavoriteItemsAll(folder.id, 50);
          allFavItems.push(...items);
        } catch (e) { /* 忽略 */ }
      }

      // ========== 时间衰减权重计算 ==========
      // 最近观看的记录权重更高：1天内权重最高，30天后趋近于0
      function timeDecay(viewAt: number): number {
        if (!viewAt) return 1;
        const daysAgo = Math.max(0, (now - viewAt) / 86400);
        return Math.max(0.1, 1 / (1 + daysAgo * 0.15));
      }

      // ========== 历史记录分析（带时间衰减）==========
      const histUpMap: Record<string, number> = {};
      const histTagMap: Record<string, number> = {};
      const histWordMap: Record<string, number> = {};
      let totalDuration = 0;
      let completed = 0, partial = 0;
      // 最近观看的UP主（用于排序）
      const histUpLastView: Record<string, number> = {};

      for (const item of history) {
        const viewAt = item.view_at || 0;
        const weight = timeDecay(viewAt);
        const progress = item.progress || 0;
        const duration = item.duration || 0;

        totalDuration += duration;
        if (duration > 0 && progress >= duration * 0.9) completed++;
        else if (progress > 0) partial++;

        // UP主（带时间衰减）
        const upName = item.author_name || '未知';
        if (upName !== '未知') {
          histUpMap[upName] = (histUpMap[upName] || 0) + weight;
          histUpLastView[upName] = Math.max(histUpLastView[upName] || 0, viewAt);
        }

        // 分类（带时间衰减）
        const tag = item.tag_name || item.tname || item.tnamev2 || '未知';
        histTagMap[tag] = (histTagMap[tag] || 0) + weight;

        // 标题关键词（带时间衰减，过滤噪音词）
        const title = item.title || item.long_title || item.show_title || '';
        const words = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 2);
        for (const w of words) {
          // 过滤纯数字、常见无意义词
          if (/^\d+$/.test(w)) continue;
          histWordMap[w] = (histWordMap[w] || 0) + weight;
        }
      }

      const histHours = Math.floor(totalDuration / 3600);
      const histMinutes = Math.floor((totalDuration % 3600) / 60);
      const completionRate = history.length > 0 ? ((completed / history.length) * 100).toFixed(1) : '0';

      // ========== 推荐分析 ==========
      const recTagMap: Record<string, number> = {};
      const recUpMap: Record<string, number> = {};
      for (const item of recommend) {
        const tag = item.tname || '未知';
        recTagMap[tag] = (recTagMap[tag] || 0) + 1;
        const up = item.owner?.name || '未知';
        if (up !== '未知') recUpMap[up] = (recUpMap[up] || 0) + 1;
      }

      // ========== 综合分类偏好 ==========
      const allTagMap: Record<string, number> = {};
      function addTag(items: any[], weight: number, isHistory: boolean = false) {
        for (const item of items) {
          const tag = item.tname || item.tnamev2 || item.tag_name || '未知';
          const w = isHistory ? timeDecay(item.view_at || 0) * weight : weight;
          allTagMap[tag] = (allTagMap[tag] || 0) + w;
        }
      }
      addTag(history, 1, true);
      addTag(recommend, 1);
      addTag(allFavItems, 1.5);
      addTag(watchLater, 1.5);
      const topAllTag = Object.entries(allTagMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

      // ========== 综合UP主偏好 ==========
      const allUpMap: Record<string, number> = {};
      const allUpLastView: Record<string, number> = {};
      function addUp(items: any[], weight: number, isHistory: boolean = false) {
        for (const item of items) {
          const up = item.owner?.name || item.author_name || '未知';
          if (up === '未知') continue;
          const viewAt = item.view_at || 0;
          const w = isHistory ? timeDecay(viewAt) * weight : weight;
          allUpMap[up] = (allUpMap[up] || 0) + w;
          allUpLastView[up] = Math.max(allUpLastView[up] || 0, viewAt);
        }
      }
      addUp(history, 1, true);
      addUp(recommend, 1);
      addUp(allFavItems, 1.5);
      addUp(watchLater, 1.5);
      // 相同权重时按最近观看时间排序
      const topAllUp = Object.entries(allUpMap)
        .sort((a, b) => {
          if (Math.abs(b[1] - a[1]) < 0.1) {
            return (allUpLastView[b[0]] || 0) - (allUpLastView[a[0]] || 0);
          }
          return b[1] - a[1];
        })
        .slice(0, 12);

      // ========== 标题关键词（全源综合，带时间衰减）==========
      const allWordMap: Record<string, number> = {};
      // 停用词列表
      const stopWords = new Set(['的', '是', '在', '了', '和', '也', '就', '都', '而', '及', '与', '着', '或', '一个', '没有', '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '可以', '不是', '如果', '因为', '但是', '这样', '那样', '已经', '还是', '只是', '其实', '然后', '还有', '可能', '应该', '比较', '非常', '特别', '这不', '那不']);
      function addWords(items: any[], weight: number = 1, isHistory: boolean = false) {
        for (const item of items) {
          const title = item.title || item.long_title || item.show_title || '';
          const words = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 2);
          const w = isHistory ? timeDecay(item.view_at || 0) * weight : weight;
          for (const word of words) {
            if (/^\d+$/.test(word) || stopWords.has(word)) continue;
            allWordMap[word] = (allWordMap[word] || 0) + w;
          }
        }
      }
      addWords(history, 1, true);
      addWords(recommend, 1);
      addWords(allFavItems, 1.5);
      addWords(watchLater, 1.5);
      const topWords = Object.entries(allWordMap).sort((a, b) => b[1] - a[1]).slice(0, 15);

      // ========== 格式化输出 ==========
      const lines: string[] = [];

      lines.push('═══════════════════════════════════════');
      lines.push('        📊 用户观看画像分析报告');
      lines.push('═══════════════════════════════════════');
      lines.push('');

      lines.push('【📋 数据概览】');
      lines.push(`  📜 历史记录：${history.length}条 | ${histHours}h${histMinutes}m`);
      lines.push(`  🎯 推荐页：${recommend.length}条`);
      lines.push(`  ⭐ 收藏夹：${allFavItems.length}条（权重↑）`);
      lines.push(`  ⏳ 稍后再看：${watchLater.length}条（权重↑）`);
      lines.push('');

      lines.push('【📜 历史记录分析】');
      lines.push(`  🎬 完播率：${completionRate}%（${completed}/${history.length}）`);
      lines.push('');

      lines.push('【🎯 综合内容偏好（时间衰减+收藏加权）】');
      lines.push(`  ${topAllTag.map(([k, v]) => `${k}(${v.toFixed(1)})`).join('、')}`);
      lines.push('');

      lines.push('【👤 喜爱UP主（时间衰减+收藏加权）】');
      lines.push(`  ${topAllUp.map(([k, v]) => `${k}(${v.toFixed(1)})`).join('、')}`);
      lines.push('');

      lines.push('【🔤 活跃兴趣关键词（时间衰减）】');
      lines.push(`  ${topWords.map(([k, v]) => `${k}(${v.toFixed(1)})`).join('、')}`);

      return { summary: lines.join('\n') };
    },
  });

  // ==================== 登录工具 ====================

  // 设置Cookie
  ctx.tools.register({
    name: 'bilibili_set_cookie',
    description: '直接使用Cookie字符串登录B站（不打开网页）。\n参数：cookie(必填)=B站Cookie字符串，格式如 SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx。\n仅当用户明确说使用cookie登录或直接发送了Cookie字符串时调用。',
    parameters: {
      type: 'object',
      properties: {
        cookie: { type: 'string', description: 'B站Cookie字符串（如 SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx）' },
      },
      required: ['cookie'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { cookie: string }) {
      const api = getAPI();
      api.setCookie(args.cookie);
      return { success: true, message: '✅ Cookie设置成功！现在可以使用需要登录的功能。' };
    },
  });

  // 生成登录二维码（启动本地网页服务展示）
  ctx.tools.register({
    name: 'bilibili_login_qr',
    description: '启动B站扫码登录页面（localhost:8031）。无需任何参数。\n当用户提到登录、扫码、打开登录页面时调用。页面支持扫码和Cookie两种登录方式，登录成功后Cookie自动保存，页面5分钟后自动关闭。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          url: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (_args: any, value: any) => [{
        type: 'text',
        text: value.success
          ? `📱 二维码登录页面已启动！\n\n🔗 请在浏览器中打开：${value.url}\n\n⏳ 使用哔哩哔哩APP扫描页面中的二维码\n✅ 扫码确认后自动登录，Cookie自动保存无需再次设置\n⏰ 页面5分钟后自动关闭`
          : `❌ 启动失败：${value.message}`,
      }],
    },
    async execute() {
      try {
        const api = getAPI();
        await api.startQrLoginServer();
        return {
          success: true,
          url: 'http://localhost:8031',
          message: '二维码登录服务已启动',
        };
      } catch (e) {
        return {
          success: false,
          url: '',
          message: (e as Error).message,
        };
      }
    },
  });

  // 停止登录服务
  ctx.tools.register({
    name: 'bilibili_login_stop',
    description: '停止B站登录页面服务（localhost:8031）。无需任何参数。通常不需要手动调用，页面会5分钟自动关闭。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', properties: { message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute() {
      const api = getAPI();
      api.stopQrLoginServer();
      return { message: '✅ 登录服务已停止' };
    },
  });

  // 导入Cookie字符串登录
  ctx.tools.register({
    name: 'bilibili_import_cookie',
    description: '通过导入完整的Cookie字符串登录B站（不打开网页）。\n参数：cookie(必填)=从浏览器开发者工具中复制的完整Cookie字符串（包含SESSDATA、bili_jct、DedeUserID等）。',
    parameters: {
      type: 'object',
      properties: {
        cookie: { type: 'string', description: '从浏览器复制的完整Cookie字符串（包含SESSDATA、bili_jct等）' },
      },
      required: ['cookie'],
    },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute(args: { cookie: string }) {
      const api = getAPI();
      try {
        const success = api.saveCookieFromString(args.cookie);
        if (success) {
          try {
            const cookieParts = args.cookie.split(';').map(s => s.trim());
            const dedeUser = cookieParts.find(p => p.startsWith('DedeUserID='));
            if (dedeUser) {
              const mid = parseInt(dedeUser.split('=')[1]);
              if (!isNaN(mid)) {
                const userInfo = await api.getUserInfo(mid);
                return {
                  success: true,
                  message: `✅ Cookie导入成功！\n👤 登录用户：${userInfo.name}\n🆔 UID：${mid}`,
                };
              }
            }
            return { success: true, message: '✅ Cookie导入成功！' };
          } catch (e) {
            return { success: true, message: '⚠️ Cookie已导入，但验证用户信息失败。请确认Cookie是否有效。' };
          }
        } else {
          return { success: false, message: '❌ Cookie格式解析失败，请检查Cookie字符串格式' };
        }
      } catch (e) {
        return { success: false, message: `❌ Cookie导入失败：${(e as Error).message}` };
      }
    },
  });

  // 退出登录（清除Cookie）
  ctx.tools.register({
    name: 'bilibili_logout',
    description: '退出B站登录，清除已保存的Cookie。无需任何参数。用户说退出登录、注销时调用。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', properties: { success: { type: 'boolean' }, message: { type: 'string' } } },
      render: (_args: any, value: any) => [{ type: 'text', text: value.message }],
    },
    async execute() {
      const api = getAPI();
      api.clearCookie();
      return { success: true, message: '✅ 已退出登录，Cookie已清除。如需再次使用登录功能，请重新设置Cookie或扫码登录。' };
    },
  });
}
