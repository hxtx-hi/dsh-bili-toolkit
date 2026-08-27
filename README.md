# DSH Bili Toolkit / B站工具箱

DSH (DeepSeek Harness) 的哔哩哔哩全功能插件，支持视频搜索、下载、字幕提取、用户画像分析、弹幕互动等 30+ 项功能。

> 💡 本插件为 [DeepSeek Harness](https://github.com/DeepSeek-AI/dsh) 的第三方插件

---

## 📦 安装

### 方式一：从 Gitee 安装（推荐国内用户）

```bash
dsh --profile web plugin add https://gitee.com/hxtx-hi/dsh-bili-toolkit.git
```

### 方式二：从 GitHub 安装

```bash
dsh --profile web plugin add https://github.com/hxtx-hi/dsh-bili-toolkit.git
```

> ⚠️ 国内环境访问 GitHub 可能超时，建议优先使用 Gitee

### 方式三：本地安装

```bash
git clone https://gitee.com/hxtx-hi/dsh-bili-toolkit.git
cd dsh-bili-toolkit
dsh --profile web plugin add .
```

> 💡 `dsh plugin add` 会自动拉取依赖、编译 TypeScript 并安装到指定 profile，无需手动编译

安装完成后**重启 DSH 服务**即可生效。

---

## 🔐 登录说明

大部分用户数据功能（收藏、历史、稍后再看、消息等）需要登录 B 站账号。

### 扫码登录（推荐）

直接告诉 AI：`登录B站`

AI 会自动打开登录页面 `http://localhost:8031`，用手机 B 站 App 扫码即可。

### Cookie 登录

1. 在浏览器登录 B 站
2. 按 F12 打开开发者工具 → Application → Cookies
3. 复制 `SESSDATA`、`bili_jct`、`DedeUserID` 的值
4. 告诉 AI：`使用cookie登录 SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx`

### 退出登录

告诉 AI：`退出B站登录`

---

## 🛠️ 功能列表

### 一、搜索与信息获取

| 工具名 | 功能 | 是否需要登录 |
|--------|------|:------------:|
| `bilibili_search` | 搜索视频（支持蓝V/黄V认证标签、合作视频标记） | ❌ |
| `bilibili_search_user` | 搜索UP主/用户 | ❌ |
| `bilibili_video_detail` | 获取视频详情（标题、简介、三联数据、合作信息） | ❌ |
| `bilibili_comments` | 获取视频评论区内容 | ❌ |
| `bilibili_user_info` | 获取UP主信息（粉丝数、认证标签） | ❌ |
| `bilibili_resolve_url` | 解析B站短链接（b23.tv）提取BV号 | ❌ |

### 二、字幕与内容分析

| 工具名 | 功能 | 是否需要登录 |
|--------|------|:------------:|
| `bilibili_get_subtitles` | 获取视频字幕（支持AI字幕和UP主手打字幕识别） | ❌ |
| `bilibili_full_analysis` | 获取视频字幕和封面图，分析内容 | ❌ |
| `bilibili_analyze_video` | 智能分析视频内容 | ❌ |

> 💡 **字幕说明**：
> - **AI字幕**：`ai-zh`（中文）、`ai-en`（英文）等，可能存在同音字识别错误
> - **手打字幕**：`zh-CN` 等，UP主手动上传，识别准确
> - **特殊说明**：若视频中烧入了中文字幕（硬字幕），B站可能仅生成英文AI字幕

### 三、UP主与视频列表

| 工具名 | 功能 | 是否需要登录 |
|--------|------|:------------:|
| `bilibili_user_videos` | 列出UP主发布的视频（支持合作视频标记） | ❌ |
| `bilibili_recommend` | 获取B站首页推荐视频 | ❌ |

### 四、用户数据（需要登录）

| 工具名 | 功能 |
|--------|------|
| `bilibili_user_favorites` | 获取用户收藏夹列表 |
| `bilibili_user_history` | 获取观看历史记录 |
| `bilibili_user_follows` | 获取关注列表（自动翻页，返回全部） |
| `bilibili_unread_count` | 获取未读消息数量 |
| `bilibili_messages` | 获取消息列表（回复、@、点赞、系统通知） |

### 五、用户习惯分析（需要登录）

| 工具名 | 功能 |
|--------|------|
| `bilibili_analyze_habits` | 综合分析用户观看画像（历史150条+、推荐页、收藏夹、稍后再看） |

> 💡 **画像分析说明**：
> - 历史记录采用**时间衰减权重**，最近观看的内容权重更高
> - 收藏夹和稍后再看内容权重 x1.5
> - 输出包括：内容分类偏好、常看UP主、活跃兴趣关键词、完播率

### 六、用户操作（需要登录，AI可代执行）

| 工具名 | 功能 |
|--------|------|
| `bilibili_like` | 给视频点赞 |
| `bilibili_unlike` | 取消点赞 |
| `bilibili_coin` | 给视频投币（1或2个） |
| `bilibili_favorite` | 收藏视频到指定收藏夹 |
| `bilibili_follow` | 关注UP主 |
| `bilibili_unfollow` | 取消关注UP主 |

### 七、视频下载

| 工具名 | 功能 | 是否需要登录 |
|--------|------|:------------:|
| `bilibili_get_video_streams` | 获取视频流地址（视频源+音频源） | ❌ |
| `bilibili_download_video` | 下载视频并自动合成（需要ffmpeg） | ❌ |

> 💡 **下载说明**：
> - 默认下载到当前工作目录
> - 支持画质：8K(127)、4K(120)、1080P(80)、720P(64)
> - ffmpeg 未安装时会自动通过 apt-get 安装
> - 非会员最高可下载 1080P

---

## 💬 使用示例

```
用户：帮我搜索原神相关的视频
AI：调用 bilibili_search → 返回视频列表

用户：下载这个视频 BV1xxx
AI：调用 bilibili_download_video → 下载到工作目录

用户：获取这个视频的字幕
AI：调用 bilibili_get_subtitles → 返回字幕内容

用户：帮我登录B站
AI：调用 bilibili_login_qr → 打开 localhost:8031

用户：分析我的观看习惯
AI：调用 bilibili_analyze_habits → 返回用户画像报告

用户：看看这个UP主的视频
AI：调用 bilibili_user_videos → 返回视频列表

用户：帮我点赞这个视频
AI：调用 bilibili_like → 执行点赞操作
```

---

## 📋 特性说明

- **蓝V/黄V认证标签**：搜索视频、UP主时自动显示认证信息
- **合作视频标记**：自动识别合作视频并标注
- **字幕类型识别**：自动区分AI字幕和手打字幕
- **时间衰减分析**：用户画像分析考虑时间因素
- **自动翻页**：关注列表、历史记录等自动获取全部数据
- **ffmpeg自动安装**：视频下载时自动安装依赖

---

## 📁 项目结构

```
dsh-bili-toolkit/
├── src/
│   ├── index.ts           # 主入口，注册所有工具
│   ├── bilibili-api.ts    # B站API封装（WBI签名、登录等）
│   ├── video-downloader.ts # 视频下载模块
│   ├── wbi-sign.ts        # WBI签名实现
│   └── client/
│       └── index.ts       # 客户端（空实现）
├── package.json
├── tsdown.config.ts
└── README.md
```

---

## 📡 API 调用参考

本插件使用的 B 站 API 接口参考了开源项目 [BiliPai](https://gitee.com/bili2333333/BiliPai)，包括但不限于：

| 接口 | 说明 | 签名方式 |
|------|------|----------|
| `/x/web-interface/wbi/search/all/v2` | 综合搜索 | WBI |
| `/x/web-interface/wbi/search/type` | 分类搜索（用户等） | WBI |
| `/x/space/wbi/arc/search` | UP主视频列表 | WBI |
| `/x/player/wbi/v2` | 字幕获取 | WBI |
| `/x/player/playurl` | 视频流地址 | 无签名 |
| `/x/web-interface/view` | 视频详情 | 无签名 |
| `/x/web-interface/card` | 用户卡片信息 | 无签名 |
| `/x/relation/stat` | 关注/粉丝数 | 无签名 |
| `/x/relation/followings` | 关注列表 | 无签名 |
| `/x/v2/history` | 观看历史 | 无签名 |
| `/x/v2/history/toview` | 稍后再看 | 无签名 |
| `/x/v3/fav/folder/list` | 收藏夹列表 | 无签名 |
| `/x/v3/fav/resource/list` | 收藏夹内容 | 无签名 |
| `/x/msgfeed/unread` | 未读消息数 | 无签名 |
| `/x/msgfeed/index` | 消息列表 | 无签名 |
| `/x/relation/modify` | 关注/取关 | POST + csrf |
| `/x/web-interface/coin/today/exp` | 今日投币 | 无签名 |
| `/x/v2/history/cursor` | 历史记录（游标翻页） | 无签名 |
| `/x/passport-login/web/qrcode/generate` | 二维码生成 | 无签名 |
| `/x/passport-login/web/qrcode/poll` | 二维码轮询 | 无签名 |

> 📌 **WBI 签名**：B站 2023 年后新增的请求签名机制，用于防止恶意爬取。本插件已完整实现该签名算法。

---

## ⚠️ 免责声明

### 法律声明

1. **本插件仅为学习交流用途**，不鼓励、不支持任何违反哔哩哔哩用户协议或相关法律法规的行为。

2. **本插件不包含任何破解、逆向工程、绕过付费限制等操作**。所有功能均基于 B 站公开 API 接口实现。

3. **用户应自行承担使用本插件所产生的一切后果**。因使用本插件导致的账号封禁、数据丢失或其他损失，开发者不承担任何责任。

4. **请合理使用本插件**，遵守哔哩哔哩的 [用户协议](https://www.bilibili.com/blackboard/user-agreement.html) 和 [社区规范](https://www.bilibili.com/blackboard/community.html)。

5. **本插件不对 B 站 API 的可用性作任何保证**。B 站可能随时修改 API 接口，导致插件功能失效。

6. **视频下载功能仅供个人学习使用**，下载的视频版权归原作者和哔哩哔哩所有，请勿用于商业用途或二次分发。

### 技术说明

- 本插件所有 API 调用均模拟正常用户浏览器行为
- 不涉及任何加密算法破解或安全漏洞利用
- Cookie 登录基于 B 站官方登录流程
- WBI 签名是 B 站公开的请求签名方案，非逆向获取

---

## ⚠️ 注意事项

1. **Cookie 安全**：登录 Cookie 保存在 `~/.dsh/bilibili/cookie.txt`，请勿泄露
2. **API 限制**：B站有请求频率限制，高频使用可能触发风控
3. **视频下载**：需要 ffmpeg，首次使用会自动安装
4. **字幕获取**：部分视频可能没有字幕或仅有英文字幕

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 🙏 致谢

- [DeepSeek Harness](https://github.com/DeepSeek-AI/dsh) - AI Agent 框架
- [BiliPai](https://gitee.com/bili2333333/BiliPai) - API 接口参考
- [哔哩哔哩](https://www.bilibili.com) - 视频平台
