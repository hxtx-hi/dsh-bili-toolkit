/**
 * B站WBI签名算法实现
 */

import crypto from 'crypto';
import { URL } from 'url';

// WBI密钥混淆表
const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// 获取MixinKey原始字符集
function getMixinKey(orig: string): string {
  return mixinKeyEncTab.map((n) => orig[n]).join('').slice(0, 32);
}

// 加密签名
function encryptWBI(orig: string, key: string): string {
  return crypto.createHash('md5').update(orig + key).digest('hex');
}

// 排序查询参数
function querySort(query: Record<string, any>): Record<string, string> {
  const keys = Object.keys(query).sort();
  const result: Record<string, string> = {};
  
  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === null) continue;
    
    const strValue = String(value)
      .replace(/[!'()*]/g, '')
      .replace(/\s+/g, '');
    
    result[key] = strValue;
  }
  
  return result;
}

// 获取当前时间戳（秒）
function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// 生成WBI签名
export function generateWbiSignature(
  params: Record<string, any>,
  imgKey: string,
  subKey: string
): { wts: number; w_rid: string } {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = getTimestamp();
  
  const query = { ...params, wts };
  const sortedQuery = querySort(query);
  
  const signStr = Object.entries(sortedQuery)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const w_rid = encryptWBI(signStr, mixinKey);
  
  return { wts, w_rid };
}

// 从API获取WBI密钥
export async function getWbiKeys(
  cookie: string | undefined,
  axios: any
): Promise<{ imgKey: string; subKey: string }> {
  const response = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
    headers: {
      Cookie: cookie || '',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  
  const { data } = response.data;
  
  if (!data?.wbi_img) {
    throw new Error('获取WBI密钥失败');
  }
  
  const imgUrl = data.wbi_img.img_url;
  const subUrl = data.wbi_img.sub_url;
  
  const imgKey = imgUrl.split('/').pop()!.split('.')[0];
  const subKey = subUrl.split('/').pop()!.split('.')[0];
  
  return { imgKey, subKey };
}
