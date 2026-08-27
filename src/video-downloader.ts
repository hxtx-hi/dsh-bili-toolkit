/**
 * B站视频下载器
 * 支持DASH格式音视频分离下载 + ffmpeg合成
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

const execPromise = promisify(exec);

// ========== 类型定义 ==========

export interface DownloadResult {
  success: boolean;
  path?: string;
  title?: string;
  author?: string;
  quality?: string;
  size?: number;
  duration?: number;
  error?: string;
}

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

export interface PlayUrlDash {
  duration: number;
  video: VideoStream[];
  audio: AudioStream[];
}

export interface PlayUrlData {
  quality: number;
  dash?: PlayUrlDash;
}

// ========== 画质映射 ==========

const QUALITY_MAP: Record<number, string> = {
  127: '8K',
  120: '4K',
  116: '1080P60',
  112: '1080P+',
  80: '1080P',
  64: '720P',
  32: '480P',
  16: '360P',
};

// 画质ID到分辨率的映射
const QUALITY_RESOLUTION: Record<number, number> = {
  127: 4320,
  120: 2160,
  116: 1080,
  112: 1080,
  80: 1080,
  64: 720,
  32: 480,
  16: 360,
};

// ========== 下载器类 ==========

export class VideoDownloader {
  private cookie: string;
  private downloadPath: string;
  private ffmpegPath: string;
  private axios;

  constructor(
    cookie: string = '',
    downloadPath?: string,
    ffmpegPath: string = 'ffmpeg'
  ) {
    this.cookie = cookie;
    this.downloadPath = downloadPath || process.cwd();
    this.ffmpegPath = ffmpegPath;

    this.axios = axios.create({
      timeout: 300000, // 5分钟超时（大文件下载）
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.bilibili.com',
      },
    });

    if (cookie) {
      this.axios.defaults.headers.common['Cookie'] = cookie;
    }
  }

  /** 检查并自动安装ffmpeg */
  async ensureFfmpeg(): Promise<void> {
    try {
      await execPromise('ffmpeg -version', { timeout: 5000 });
      // ffmpeg已存在
    } catch {
      try {
        // 尝试apt-get安装
        await execPromise('sudo apt-get update -qq && sudo apt-get install -y ffmpeg', { timeout: 120000 });
      } catch (aptError: any) {
        // 尝试yum安装（CentOS/RHEL）
        try {
          await execPromise('sudo yum install -y ffmpeg', { timeout: 120000 });
        } catch {
          throw new Error('ffmpeg安装失败，请手动安装：sudo apt-get install ffmpeg 或 sudo yum install ffmpeg');
        }
      }
    }
  }

  // ========== 主下载方法 ==========

  /**
   * 下载视频
   * @param bvid 视频BV号
   * @param requestedQuality 画质ID（不传则使用最高可用画质）
   */
  async download(
    bvid: string,
    requestedQuality?: number
  ): Promise<DownloadResult> {
    try {
      // 确保ffmpeg可用
      await this.ensureFfmpeg();

      // 确保下载目录存在
      await fs.mkdir(this.downloadPath, { recursive: true });

      // 第一步：获取视频信息
      const videoInfo = await this.getVideoInfo(bvid);
      const cid = videoInfo.cid;
      const title = videoInfo.title;
      const author = videoInfo.owner?.name || '未知UP主';
      const duration = videoInfo.duration || 0;

      // 第二步：获取播放地址
      const playUrl = await this.getPlayUrl(bvid, cid, requestedQuality);

      if (!playUrl.dash) {
        return { success: false, error: '无法获取视频流信息，可能是大会员专属内容' };
      }

      // 第三步：下载音频源
      const audioPath = await this.downloadAudio(playUrl.dash.audio);

      // 第四步：下载视频源
      const videoPath = await this.downloadVideo(playUrl.dash.video);

      // 第五步：合成视频
      const outputPath = await this.mergeAudioVideo(
        videoPath,
        audioPath,
        title
      );

      // 获取文件大小
      const stat = await fs.stat(outputPath);

      // 清理临时文件
      await this.cleanup(audioPath, videoPath);

      const qualityStr =
        QUALITY_MAP[playUrl.quality] || `${playUrl.quality}P`;

      return {
        success: true,
        path: outputPath,
        title,
        author,
        quality: qualityStr,
        size: stat.size,
        duration,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ========== API调用 ==========

  /** 获取视频信息 */
  private async getVideoInfo(bvid: string): Promise<any> {
    const url = 'https://api.bilibili.com/x/web-interface/view';
    const response = await this.axios.get(url, { params: { bvid } });

    if (response.data.code !== 0) {
      throw new Error(response.data.message || '获取视频信息失败');
    }

    return response.data.data;
  }

  /** 获取播放地址 */
  private async getPlayUrl(
    bvid: string,
    cid: number,
    quality?: number
  ): Promise<PlayUrlData> {
    const qn = quality || 80; // 默认1080P
    const fnval = 4048; // DASH格式

    const url = 'https://api.bilibili.com/x/player/playurl';
    const response = await this.axios.get(url, {
      params: { bvid, cid, qn, fnval },
      headers: { Referer: `https://www.bilibili.com/video/${bvid}` },
    });

    if (response.data.code !== 0) {
      throw new Error(response.data.message || '获取播放地址失败');
    }

    return response.data.data;
  }

  // ========== 下载逻辑 ==========

  /** 下载音频流 */
  private async downloadAudio(audioList: AudioStream[]): Promise<string> {
    if (!audioList || audioList.length === 0) {
      throw new Error('无可用音频流');
    }

    // 选择最高码率的音频
    const bestAudio = audioList.sort(
      (a, b) => b.bandwidth - a.bandwidth
    )[0];

    const tempPath = path.join(this.downloadPath, '_temp_audio.m4s');
    await this.downloadFile(bestAudio.baseUrl, tempPath);

    return tempPath;
  }

  /** 下载视频流 */
  private async downloadVideo(videoList: VideoStream[]): Promise<string> {
    if (!videoList || videoList.length === 0) {
      throw new Error('无可用视频流');
    }

    // 选择最高画质的视频
    const bestVideo = videoList.sort((a, b) => {
      const heightA = a.height || 0;
      const heightB = b.height || 0;
      return heightB - heightA;
    })[0];

    const tempPath = path.join(this.downloadPath, '_temp_video.m4s');
    await this.downloadFile(bestVideo.baseUrl, tempPath);

    return tempPath;
  }

  /** 下载单个文件 */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    // 尝试主地址
    try {
      const response = await this.axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          Cookie: this.cookie,
          Referer: 'https://www.bilibili.com',
        },
      });

      await fs.writeFile(destPath, Buffer.from(response.data));
    } catch (error: any) {
      throw new Error(`下载失败: ${error.message}`);
    }
  }

  // ========== 合成逻辑 ==========

  /** 使用ffmpeg合成音视频 */
  private async mergeAudioVideo(
    videoPath: string,
    audioPath: string,
    title: string
  ): Promise<string> {
    const outputPath = path.join(
      this.downloadPath,
      `${this.sanitizeFilename(title)}.mp4`
    );

    const command = [
      this.ffmpegPath,
      `-i "${videoPath}"`,
      `-i "${audioPath}"`,
      '-c copy', // 直接复制，不重新编码
      '-y', // 覆盖已存在文件
      `"${outputPath}"`,
    ].join(' ');

    try {
      await execPromise(command, { timeout: 60000 });
    } catch (error: any) {
      // 如果ffmpeg不可用，尝试直接重命名
      if (error.message.includes('ffmpeg') || error.message.includes('not found')) {
        // 尝试使用系统ffmpeg
        try {
          await execPromise(
            `ffmpeg -i "${videoPath}" -i "${audioPath}" -c copy -y "${outputPath}"`,
            { timeout: 60000 }
          );
        } catch {
          throw new Error('ffmpeg不可用，请安装ffmpeg后重试');
        }
      } else {
        throw error;
      }
    }

    return outputPath;
  }

  // ========== 工具方法 ==========

  /** 清理临时文件 */
  private async cleanup(...files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch {
        // 忽略删除失败
      }
    }
  }

  /** 清理文件名中的非法字符 */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  // ========== 静态工具方法 ==========

  /** 格式化文件大小 */
  static formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
  }

  /** 格式化时长 */
  static formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
