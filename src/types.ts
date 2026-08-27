/**
 * B站插件类型定义
 */

// 搜索参数
export interface SearchParams {
  keyword: string;
  page?: number;
  pageSize?: number;
  searchType?: 'video' | 'bangumi' | 'live' | 'article';
  order?: 'totalrank' | 'click' | 'pubdate' | 'dm' | 'stow';
  duration?: number;
  tids?: number[];
}

// 搜索结果项
export interface SearchResultItem {
  bvid: string;
  title: string;
  description: string;
  mid: number;
  author: string;
  pic: string;
  play: number;
  danmaku: number;
  review: number;
  favorites: number;
  like: number;
  pubdate: number;
  duration: string;
  tag: string[];
  typename: string;
  aid: number;
  cid: number;
}

// 视频详情
export interface VideoDetail {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  desc: string;
  pic: string;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
  pages: Array<{
    cid: number;
    part: string;
    duration: number;
    view: number;
  }>;
  pubdate: number;
  duration: number;
}

// 评论
export interface Comment {
  rpid: number;
  content: {
    message: string;
  };
  member: {
    mid: number;
    uname: string;
    avatar: string;
    level_info: {
      current_level: number;
    };
  };
  stat: {
    like: number;
    reply: number;
  };
  ctime: number;
}

// 用户信息
export interface UserInfo {
  mid: number;
  name: string;
  face: string;
  sex: string;
  sign: string;
  level: number;
  fans: number;
  attention: number;
}

// 收藏夹
export interface FavoriteFolder {
  id: number;
  title: string;
  cover: string;
  media_count: number;
}

// 历史记录
export interface HistoryItem {
  bvid: string;
  title: string;
  pic: string;
  owner: {
    mid: number;
    name: string;
  };
  progress?: {
    last_play_time: number;
    duration: number;
  };
  view_at: number;
}

// 关注列表
export interface FollowItem {
  mid: number;
  uname: string;
  face: string;
  sign: string;
  attribute: number;
}

// 用户习惯分析
export interface UserTasteProfile {
  favoriteCategories: Array<{
    tid: number;
    name: string;
    count: number;
    percentage: number;
  }>;
  favoriteUPs: Array<{
    mid: number;
    name: string;
    interactionCount: number;
  }>;
  activeHours: number[];
  preferenceTags: string[];
  stats: {
    totalWatchTime: number;
    avgVideoLength: number;
    completionRate: number;
    interactionRate: number;
  };
  recentTrends: {
    emerging: string[];
    declining: string[];
  };
}

// 视频流
export interface VideoStream {
  id: number;
  baseUrl: string;
  backupUrl: string[];
  bandwidth: number;
  codecs: string;
  width?: number;
  height?: number;
  mimeType: string;
}

export interface AudioStream {
  id: number;
  baseUrl: string;
  backupUrl: string[];
  bandwidth: number;
  codecs: string;
  mimeType: string;
}

// 播放地址结果
export interface PlayUrlResult {
  quality: number;
  format: string;
  timelength: number;
  dash?: {
    duration: number;
    video: VideoStream[];
    audio: AudioStream[];
  };
}

// 下载配置
export interface DownloadConfig {
  merger: 'ffmpeg' | 'mp4box' | 'mkvmerge';
  downloadPath: string;
  defaultQuality: number;
  keepSource: boolean;
  filenameTemplate: string;
}

// 插件配置
export interface BilibiliConfig {
  cookie?: string;
  apiKey?: string;
  apiSecret?: string;
  downloadPath?: string;
  defaultQuality?: number;
  merger?: 'ffmpeg' | 'mp4box' | 'mkvmerge';
}
