/**
 * 万象资讯采集引擎 (Panorama News Collector)
 * 
 * 参考 TrendRadar (54K★) 多平台聚合 + NewsNow (4.5K★) 实时新闻理念
 * 扩展至 40+ 源，覆盖 6 大分类：综合、AI、编程、运维、产品、财经
 */
import { Database } from '../db.js';
import { detectCategory } from './classifier.js';

// ==================== 6 大分类定义 ====================
const CATEGORIES = {
  general:  { id: 'general',  name: '综合资讯', icon: 'globe',     color: '#0EA5E9' },
  ai:       { id: 'ai',       name: 'AI 前沿', icon: 'cpu',       color: '#8B5CF6' },
  dev:      { id: 'dev',      name: '编程开发', icon: 'code',      color: '#10B981' },
  ops:      { id: 'ops',      name: '运维架构', icon: 'server',    color: '#F59E0B' },
  product:  { id: 'product',  name: '产品设计', icon: 'layout',    color: '#EC4899' },
  biz:      { id: 'biz',      name: '财经商业', icon: 'trending-up', color: '#EF4444' }
};

// ==================== 30+ 新闻源定义 ====================

// [综合资讯] - 多平台热榜与科技资讯
const FEEDS_GENERAL = [
  {
    url: 'https://www.solidot.org/index.rss',
    name: 'Solidot', category: 'general', hotScore: 70, lang: 'zh',
    desc: '奇客的资讯·重要的东西'
  },
  {
    url: 'https://www.ruanyifeng.com/blog/atom.xml',
    name: '阮一峰', category: 'general', hotScore: 85, lang: 'zh',
    desc: '科技爱好者周刊'
  },
  {
    url: 'https://www.oschina.net/news/rss',
    name: '开源中国', category: 'general', hotScore: 75, lang: 'zh',
    desc: '开源技术社区'
  },
  {
    url: 'https://feed.cnblogs.com/blog/picked/rss',
    name: '博客园', category: 'general', hotScore: 70, lang: 'zh',
    desc: '开发者社区精华'
  },
  {
    url: 'https://segmentfault.com/feeds/blogs',
    name: '思否', category: 'general', hotScore: 65, lang: 'zh',
    desc: '开发者技术问答'
  },
  {
    url: 'https://www.infoq.cn/feed',
    name: 'InfoQ', category: 'general', hotScore: 80, lang: 'zh',
    desc: '技术实践与架构'
  },
  {
    url: 'https://www.huxiu.com/rss/0.xml',
    name: '虎嗅网', category: 'general', hotScore: 82, lang: 'zh',
    desc: '科技商业观察'
  },
  {
    url: 'https://www.ifanr.com/feed',
    name: '爱范儿', category: 'general', hotScore: 78, lang: 'zh',
    desc: '科技数码媒体'
  },
  {
    url: 'https://www.ithome.com/rss/',
    name: 'IT之家', category: 'general', hotScore: 80, lang: 'zh',
    desc: 'IT资讯门户'
  },
  {
    url: 'https://www.pingwest.com/feed',
    name: '品玩', category: 'general', hotScore: 72, lang: 'zh',
    desc: '科技媒体与创新报道'
  },
];

// [AI 前沿] - 大模型、人工智能、智能体
const FEEDS_AI = [
  {
    url: 'https://hotai.news/feed.xml',
    name: 'HotAI 快讯', category: 'ai', hotScore: 90, lang: 'zh',
    desc: '实时更新的人工智能新闻',
    urlBackup: [
      'https://hotai.news/news-report.json',
      'https://hotai.news/news/'
    ]
  },
  {
    url: 'https://www.jiqizhixin.com/rss',
    name: '机器之心', category: 'ai', hotScore: 88, lang: 'zh',
    desc: '全球人工智能信息服务'
  },
  {
    url: 'https://www.qbitai.com/feed',
    name: '量子位', category: 'ai', hotScore: 87, lang: 'zh',
    desc: 'AI 科技媒体'
  },
  {
    url: 'https://zhidx.com/feed',
    name: '智东西', category: 'ai', hotScore: 82, lang: 'zh',
    desc: '智能产业新媒体'
  },
  {
    url: 'https://rsshub.app/36kr/motif/3276897824862212',
    name: '36氪 AI', category: 'ai', hotScore: 80, lang: 'zh',
    desc: 'AI 产业报道',
    urlBackup: [
      'https://rsshub.moeyy.cn/36kr/motif/3276897824862212',
      'https://rsshub.rsshub.net/36kr/motif/3276897824862212',
      'https://hub.slarker.me/36kr/motif/3276897824862212',
      'https://rsshub.pseudoyu.com/36kr/motif/3276897824862212'
    ]
  },
  {
    url: 'https://rsshub.app/jiqizhixin/categories/1',
    name: '机器之心精选', category: 'ai', hotScore: 78, lang: 'zh',
    desc: 'AI 精选文章',
    urlBackup: [
      'https://rsshub.moeyy.cn/jiqizhixin/categories/1',
      'https://rsshub.rsshub.net/jiqizhixin/categories/1',
      'https://hub.slarker.me/jiqizhixin/categories/1'
    ]
  },
  {
    url: 'https://rsshub.app/huggingface/daily-papers',
    name: 'HuggingFace 日报', category: 'ai', hotScore: 90, lang: 'zh',
    desc: 'AI 论文日报',
    urlBackup: [
      'https://rsshub.moeyy.cn/huggingface/daily-papers',
      'https://rsshub.rsshub.net/huggingface/daily-papers',
      'https://hub.slarker.me/huggingface/daily-papers'
    ]
  },
];

// [编程开发] 
const FEEDS_DEV = [
  {
    url: 'https://cloud.tencent.com/developer/feed',
    name: '腾讯云社区', category: 'dev', hotScore: 76, lang: 'zh',
    desc: '腾讯云开发者社区'
  },
  {
    url: 'https://rsshub.moeyy.cn/hellogithub',
    name: 'HelloGitHub', category: 'dev', hotScore: 72, lang: 'zh',
    desc: '有趣的开源项目推荐',
    urlBackup: ['https://rsshub.app/hellogithub', 'https://hub.slarker.me/hellogithub']
  },
  {
    url: 'https://rsshub.app/github/trending/daily',
    name: 'GitHub 趋势', category: 'dev', hotScore: 85, lang: 'zh',
    desc: '每日 GitHub 热门项目',
    urlBackup: [
      'https://rsshub.moeyy.cn/github/trending/daily',
      'https://rsshub.rsshub.net/github/trending/daily',
      'https://hub.slarker.me/github/trending/daily'
    ]
  },
  {
    url: 'https://rsshub.app/v2ex/topics/hot',
    name: 'V2EX 热门', category: 'dev', hotScore: 78, lang: 'zh',
    desc: '创意工作者社区',
    urlBackup: [
      'https://rsshub.moeyy.cn/v2ex/topics/hot',
      'https://rsshub.rsshub.net/v2ex/topics/hot',
      'https://hub.slarker.me/v2ex/topics/hot'
    ]
  },
  {
    url: 'https://rsshub.app/juejin/category/frontend',
    name: '掘金前端', category: 'dev', hotScore: 75, lang: 'zh',
    desc: '前端技术文章',
    urlBackup: [
      'https://rsshub.moeyy.cn/juejin/category/frontend',
      'https://rsshub.rsshub.net/juejin/category/frontend',
      'https://hub.slarker.me/juejin/category/frontend'
    ]
  },
  {
    url: 'https://rsshub.app/juejin/category/backend',
    name: '掘金后端', category: 'dev', hotScore: 75, lang: 'zh',
    desc: '后端技术文章',
    urlBackup: [
      'https://rsshub.moeyy.cn/juejin/category/backend',
      'https://rsshub.rsshub.net/juejin/category/backend',
      'https://hub.slarker.me/juejin/category/backend'
    ]
  },
];

// [运维架构]
const FEEDS_OPS = [
  {
    url: 'https://tech.meituan.com/feed',
    name: '美团技术', category: 'ops', hotScore: 85, lang: 'zh',
    desc: '美团技术团队博客'
  },
  {
    url: 'https://rsshub.app/kubernetes/blog',
    name: 'K8s 博客', category: 'ops', hotScore: 80, lang: 'zh',
    desc: 'Kubernetes 官方博客',
    urlBackup: [
      'https://rsshub.moeyy.cn/kubernetes/blog',
      'https://rsshub.rsshub.net/kubernetes/blog',
      'https://hub.slarker.me/kubernetes/blog'
    ]
  },
];

// [产品设计]
const FEEDS_PRODUCT = [
  {
    url: 'https://www.woshipm.com/feed',
    name: '人人都是产品经理', category: 'product', hotScore: 75, lang: 'zh',
    desc: '产品/运营/设计社区'
  },
  {
    url: 'https://rsshub.app/sspai',
    name: '少数派', category: 'product', hotScore: 72, lang: 'zh',
    desc: '数字生活与效率指南',
    urlBackup: [
      'https://rsshub.moeyy.cn/sspai',
      'https://rsshub.rsshub.net/sspai',
      'https://hub.slarker.me/sspai'
    ]
  },
  {
    url: 'https://rsshub.app/uisdc/topic/design',
    name: '优设网', category: 'product', hotScore: 65, lang: 'zh',
    desc: '设计师交流平台',
    urlBackup: [
      'https://rsshub.moeyy.cn/uisdc/topic/design',
      'https://rsshub.rsshub.net/uisdc/topic/design',
      'https://hub.slarker.me/uisdc/topic/design'
    ]
  },
];

// [财经商业]
const FEEDS_BIZ = [
  {
    url: 'https://rsshub.app/cls/telegraph',
    name: '财联社电报', category: 'biz', hotScore: 85, lang: 'zh',
    desc: '7×24小时财经快讯',
    urlBackup: [
      'https://rsshub.moeyy.cn/cls/telegraph',
      'https://rsshub.rsshub.net/cls/telegraph',
      'https://hub.slarker.me/cls/telegraph'
    ]
  },
  {
    url: 'https://rsshub.app/wallstreetcn/hot',
    name: '华尔街见闻', category: 'biz', hotScore: 82, lang: 'zh',
    desc: '全球财经资讯',
    urlBackup: [
      'https://rsshub.moeyy.cn/wallstreetcn/hot',
      'https://rsshub.rsshub.net/wallstreetcn/hot',
      'https://hub.slarker.me/wallstreetcn/hot'
    ]
  },
  {
    url: 'https://rsshub.app/36kr/motif/3276901922258436',
    name: '36氪创投', category: 'biz', hotScore: 75, lang: 'zh',
    desc: '创业投资报道',
    urlBackup: [
      'https://rsshub.moeyy.cn/36kr/motif/3276901922258436',
      'https://rsshub.rsshub.net/36kr/motif/3276901922258436',
      'https://hub.slarker.me/36kr/motif/3276901922258436'
    ]
  },
];

// 所有 RSS 源汇总
const ALL_FEEDS = [
  ...FEEDS_GENERAL,
  ...FEEDS_AI,
  ...FEEDS_DEV,
  ...FEEDS_OPS,
  ...FEEDS_PRODUCT,
  ...FEEDS_BIZ,
];

export { ALL_FEEDS, CATEGORIES, detectCategory };

// ==================== 热搜榜单抓取 ====================

/**
 * 抓取微博热搜 (非 RSS，HTML 解析)
 * TrendRadar 的核心能力之一：多平台热搜聚合
 */
// 微博热搜 fetcher 保留，但暂从采集列表移除，以减少综合资讯中微博内容占比
const HOT_SEARCH_SOURCES = [
  {
    id: 'zhihu',
    name: '知乎热榜',
    url: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20',
    fetchFn: 'zhihuHot',
    category: 'general',
    icon: '📚'
  },
  {
    id: 'baidu',
    name: '百度热搜',
    url: 'https://top.baidu.com/board?tab=realtime',
    fetchFn: 'baiduHot',
    category: 'general',
    icon: '🔍'
  },
];

// ==================== 工具函数 ====================

/**
 * 带超时的 fetch 封装（防止单个源卡死阻塞全部采集）
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const doFetch = async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            return await fetch(url, { ...options, signal: controller.signal })
        } finally {
            clearTimeout(timer)
        }
    }
    try {
        return await doFetch()
    } catch (err) {
        // 遭遇短暂网络抖动或连接重置时轻量重试一次
        return await doFetch()
    }
}

/**
 * 解析 RSS/Atom XML 为 items 数组（公共提取函数，消除 collectNews 和 collectSingleSource 的重复）
 */
function parseRSSItems(xmlText) {
    const items = []
    const itemRegex = /<(item|entry)>([\s\S]*?)<\/\1>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) items.push(match[2])
    return items
}

/**
 * 从 item content 中提取 title, link, description（公共提取函数）
 */
function extractItemFields(itemContent) {
    const titleMatch = itemContent.match(/<title(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
    const title = titleMatch ? cleanPlainText(titleMatch[1]) : ''
    if (!title) return null

    let link = ''
    const rssLinkM = itemContent.match(/<link(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)
    if (rssLinkM && rssLinkM[1].trim()) {
        link = rssLinkM[1].trim()
    } else {
        const atomLinkM = itemContent.match(/<link\s+[^>]*href=["']([^"']+)["']/i)
        if (atomLinkM) link = atomLinkM[1].trim()
    }
    if (!link) return null

    let description = ''
    const descMatch = itemContent.match(/<(content:encoded|content|description|summary)(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/i)
    if (descMatch) description = descMatch[2].trim()

    return { title, link, description }
}

function normalizeArticleUrl(url) {
  if (!url) return ''
  try {
    const u = new URL(url.trim())
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'from', 'spm', 'ref', 'source', 'fbclid', 'gclid']
    trackingParams.forEach(p => u.searchParams.delete(p))
    u.hash = ''
    return u.toString()
  } catch {
    return url.trim()
  }
}

// 用 SHA-256 生成稳定的定长去重 key（避免 btoa 对非 Latin1 字符抛错）
async function hashKey(input) {
  const normalized = normalizeArticleUrl(input)
  const data = new TextEncoder().encode(normalized)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function cleanPlainText(text) {
  if (!text) return '';
  let result = decodeHtmlEntities(text);
  result = result.replace(/<[^>]+>/g, '');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

function isPredominantlyChinese(text) {
  if (!text || !text.trim()) return false;
  const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  if (total === 0) return false;
  return chinese / total >= 0.10; // 放宽到 10%，因为科技文章经常包含大量英文代码和术语
}

function htmlToMarkdown(html) {
  if (!html) return '';
  let text = html;
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  text = text.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![$1]($2)');
  text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![]($1)');
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]/gi, '\n\n### $1\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHtmlEntities(text);
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+\n/g, '\n');
  return text.trim();
}

function normalizeBody(body, title) {
  let content = body.trim();
  if (!content) return '';
  const plainTitle = cleanPlainText(title);
  if (plainTitle && content.startsWith(plainTitle)) {
    content = content.slice(plainTitle.length).trim();
  }
  content = content.replace(/^#{1,6}\s*.+\n+/m, '').trim();
  if (content.length > 100000) {
    content = content.substring(0, 100000) + '\n\n...（正文过长已截取）';
  }
  return content;
}

function formatArticle({ title, body, link, sourceName, sourceDesc, hotScore }) {
  const normalizedBody = normalizeBody(body, title);
  let main = normalizedBody || `本文摘录自 **${sourceName}**，完整内容请通过下方原文链接查看。`;
  return [
    main,
    '',
    '---',
    '',
    `**来源**：${sourceName}${sourceDesc ? ' · ' + sourceDesc : ''}`,
    `**原文链接**：[点击查看](${link})`,
    hotScore ? `**热度**：${'★'.repeat(Math.min(5, Math.ceil(hotScore / 20)))} (${hotScore}/100)` : '',
    '',
    '*本文由 万象资讯采集引擎 自动抓取*'
  ].filter(Boolean).join('\n');
}

/**
 * 规则提取摘要：智能提取文章前 2-3 句作为摘要
 * - 清理 Markdown 标记
 * - 在句号/问号/感叹号/换行处断句
 * - 限制约 150 字符，确保语义完整
 */
function extractSummary(text, title) {
  if (!text) return '';

  // 1. 去除 Markdown 标记和 HTML
  let cleaned = text
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>~|]/g, '')
    .replace(/^#{1,6}\s+.+$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n{2,}/g, '。')
    .replace(/\n/g, '，')
    .replace(/\s+/g, ' ')
    .trim();

  // 2. 如果标题在前面，去掉
  const plainTitle = title ? title.replace(/[#*_`\[\]]/g, '').trim() : '';
  if (plainTitle && cleaned.startsWith(plainTitle)) {
    cleaned = cleaned.slice(plainTitle.length).replace(/^[，。！？\s]+/, '').trim();
  }

  // 3. 按句子分割，收集前 2-3 个完整句子
  const sentences = cleaned.split(/(?<=[。！？])/);
  let summary = '';
  const MAX_CHARS = 150;

  for (let i = 0; i < sentences.length && i < 3; i++) {
    const s = sentences[i].trim();
    if (!s || s.length < 2) continue;
    if (summary.length + s.length > MAX_CHARS) {
      // 尽量在句号处截断
      const remaining = MAX_CHARS - summary.length;
      if (remaining > 20) {
        summary += s.substring(0, remaining);
        // 回退到最后一个句号
        const lastPeriod = summary.lastIndexOf('。');
        if (lastPeriod > summary.length * 0.6) {
          summary = summary.substring(0, lastPeriod + 1);
        } else {
          summary += '…';
        }
      }
      break;
    }
    summary += s;
    if (!s.endsWith('。') && !s.endsWith('！') && !s.endsWith('？')) {
      summary += '。';
    }
  }

  // 4. 兜底：如果还是没有内容，取前 120 字符
  if (summary.length < 10 && cleaned.length > 10) {
    summary = cleaned.substring(0, 120);
    const lastPeriod = summary.lastIndexOf('。');
    if (lastPeriod > 40) {
      summary = summary.substring(0, lastPeriod + 1);
    } else {
      summary += '…';
    }
  }

  return summary.trim();
}

// ==================== 热搜抓取函数 ====================

async function fetchZhihuHot(env) {
  try {
    const resp = await fetchWithTimeout('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cf: { cacheTtl: 600 }
    }, 10000);
    if (!resp.ok) return [];
    const data = await resp.json();
    const items = (data?.data || []).slice(0, 20);
    return items.map((item, i) => ({
      title: item.target?.title || item.target?.question?.title || '',
      link: item.target?.url || `https://www.zhihu.com/question/${item.target?.id}`,
      description: item.target?.excerpt || '',
      hotValue: parseInt(item.detail_text?.match(/\d+/)?.[0] || 0) || 0,
      rank: i + 1,
      source: 'zhihu',
      sourceName: '知乎热榜'
    }));
  } catch (e) {
    console.warn('[collector] fetchZhihuHot 失败:', e.message);
    return [];
  }
}

async function fetchBaiduHot(env) {
  try {
    const resp = await fetchWithTimeout('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      cf: { cacheTtl: 600 }
    }, 10000);
    if (!resp.ok) return [];
    const html = await resp.text();
    const items = [];
    // 解析百度热搜 HTML 结构
    const cardRegex = /<div\s+class="category-wrap_iQLoo[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    let rank = 0;
    while ((match = cardRegex.exec(html)) !== null && rank < 20) {
      rank++;
      const block = match[1];
      const titleMatch = block.match(/<div\s+class="c-single-text-ellipsis[^"]*">([^<]+)</);
      const linkMatch = block.match(/href="([^"]+)"/);
      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          link: linkMatch ? linkMatch[1] : '',
          description: '',
          hotValue: 0,
          rank,
          source: 'baidu',
          sourceName: '百度热搜'
        });
      }
    }
    return items;
  } catch (e) {
    console.warn('[collector] fetchBaiduHot 失败:', e.message);
    return [];
  }
}

const HOT_FETCHERS = { zhihuHot: fetchZhihuHot, baiduHot: fetchBaiduHot };

// ==================== 主采集流程 ====================

/**
 * RSS 新闻采集（后台定时触发 / 手动触发）
 */
/**
 * 采集单个 RSS 源（供管理后台手动调用）
 * @param {object} env - Cloudflare env
 * @param {object} feed - Feed 配置对象 { url, name, category, hotScore, lang, desc, urlBackup }
 */
export async function collectSingleSource(env, feed, options = {}) {
    const { maxPerSource = 10, onNewPost } = options;
    const db = new Database(env);
    await db.init();
    let collected = 0;
    const log = [];

    log.push(`[${feed.category}] ${feed.name}`);

    // 智能源 URL 适配：针对已知源（如 hotai.news）自动补充真实 feed 与数据源地址
    const rawUrls = (feed.urlBackup && feed.urlBackup.length > 0)
        ? [feed.url, ...feed.urlBackup]
        : [feed.url];
    const expandedUrls = [];
    for (const u of rawUrls) {
        if (!u) continue;
        if (/^https?:\/\/hotai\.news(\/news\/?|\/?)$/i.test(u.trim())) {
            expandedUrls.push('https://hotai.news/feed.xml');
            expandedUrls.push('https://hotai.news/news-report.json');
        }
        expandedUrls.push(u);
    }
    const urlsToTry = Array.from(new Set(expandedUrls));
    let response, lastError = null;

    for (const url of urlsToTry) {
        try {
            response = await fetchWithTimeout(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 PanoramaCollector/2.0',
                    'Accept': 'application/xml, text/xml, application/json, */*'
                },
                cf: { cacheTtl: 300 }
            });
            if (response.ok) { lastError = null; break; }
            else { lastError = new Error(`HTTP ${response.status}`); }
        } catch (err) { lastError = err; }
    }
    if (lastError) {
        log.push(`  ⚠ 所有 URL 均失败: ${lastError.message}`);
        return { collected, logs: log };
    }

    const rawText = await response.text();
    let items = [];

    // 适配 JSON 格式资讯源（如 hotai news-report.json 等）
    if (rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
        try {
            const data = JSON.parse(rawText);
            const list = Array.isArray(data) ? data : (data.items || []);
            items = list.map(item => ({
                title: cleanPlainText(item.title || ''),
                link: item.url || (item.sources?.[0]?.url) || (item.route ? `https://hotai.news${item.route}` : ''),
                description: item.summary || item.description || ''
            })).filter(it => it.title && it.link);
        } catch (e) {
            log.push(`  ⚠ JSON 解析失败: ${e.message}`);
        }
    } else {
        const rawItems = parseRSSItems(rawText);
        for (const it of rawItems) {
            const fields = extractItemFields(it);
            if (fields) items.push(fields);
        }
    }

    log.push(`  · 解析 ${items.length} 条`);

    for (const item of items) {
        const { title, link, description } = item;
        const markdownDesc = htmlToMarkdown(description);

        if (feed.category !== 'dev' && feed.category !== 'ai') {
            if (!isPredominantlyChinese(`${title} ${markdownDesc}`)) continue;
        }

        const kvKey = `pn:news:${await hashKey(link)}`;
        const imported = await env.suyuankv.get(kvKey);
        if (imported) continue;

        const content = formatArticle({
            title, body: markdownDesc, link,
            sourceName: feed.name,
            sourceDesc: feed.desc || '',
            hotScore: feed.hotScore || 60
        });

        const summary = extractSummary(markdownDesc, title);
        const category = detectCategory(title, markdownDesc, feed.category);

        const newId = await db.createPost(0, `NewsBot (${feed.name})`, title, content, category, feed.hotScore || 60, category, feed.name, summary);
        if (onNewPost && newId) onNewPost(newId, title, content, feed.name);
        await env.suyuankv.put(kvKey, 'true', { expirationTtl: 14 * 24 * 60 * 60 });

        collected++;
        if (collected >= maxPerSource) { log.push(`  ✓ 已达上限(${maxPerSource}条)`); break; }
    }
    if (collected > 0) log.push(`  ✓ 入库 ${collected} 条`);

    return { collected, logs: log };
}

/**
 * 同步所有数据库中的动态源（支持并发加速 + 进度追踪）
 */
export async function collectAllDynamicSources(env, dynamicFeeds, onProgress) {
    const db = new Database(env);
    await db.init();
    let totalCollected = 0;
    const log = [];
    const CONCURRENCY = 5; // 同时抓取 5 个源

    for (let i = 0; i < dynamicFeeds.length; i += CONCURRENCY) {
        const batch = dynamicFeeds.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
            batch.map(feed => collectSingleSource(env, feed).catch(err => ({
                collected: 0,
                logs: [`⚠ [${feed.category}] ${feed.name}: ${err.message}`]
            })))
        );

        for (const result of results) {
            if (result.logs) log.push(...result.logs);
            totalCollected += result.collected;
        }

        // 进度回调（供后台任务使用）
        if (onProgress) {
            onProgress({
                processed: Math.min(i + CONCURRENCY, dynamicFeeds.length),
                total: dynamicFeeds.length,
                collected: totalCollected
            });
        }
    }

    log.push(`📊 动态源采集完成：${dynamicFeeds.length} 个源，共 ${totalCollected} 条`);
    return { totalCollected, logs: log };
}

export async function collectNews(env, onNewPost) {
  const db = new Database(env);
  await db.init();
  let totalCollected = 0;
  const log = [];
  const CONCURRENCY = 5; // 并发抓取 5 个源，避免单次 Cron 串行超时

  // 加载所有硬编码源
  const allFeeds = [...ALL_FEEDS];

  // 确保数据库 sources 表中同步包含最新的预设源（如 HotAI 快讯）
  try {
    await db.seedDefaultSources(ALL_FEEDS);
  } catch (e) {
    // 忽略种子化错误
  }

  // 从数据库加载动态源并合并（同名源以数据库配置覆盖硬编码）
  try {
    const dynamicSources = await db.findActiveSources();
    for (const ds of dynamicSources) {
      const feed = {
        url: ds.url,
        name: ds.name,
        category: ds.category,
        hotScore: ds.hot_score,
        lang: ds.lang,
        desc: ds.description,
        urlBackup: JSON.parse(ds.url_backup || '[]')
      };
      // 数据库源优先覆盖同名硬编码源
      const existingIdx = allFeeds.findIndex(f => f.name === ds.name);
      if (existingIdx >= 0) {
        allFeeds[existingIdx] = feed;
      } else {
        allFeeds.push(feed);
      }
    }
  } catch (e) {
    log.push(`⚠ 加载动态源失败: ${e.message}，使用硬编码源`);
  }

  // 统一并发采集：每个源最多 5 条，复用 collectSingleSource 逻辑
  for (let i = 0; i < allFeeds.length; i += CONCURRENCY) {
    const batch = allFeeds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(feed => collectSingleSource(env, feed, { maxPerSource: 5, onNewPost })
        .catch(err => ({ collected: 0, logs: [`⚠ [${feed.category}] ${feed.name}: ${err.message}`] })))
    );
    for (const result of results) {
      if (result.logs) log.push(...result.logs);
      totalCollected += result.collected;
    }
  }

  log.push(`📊 RSS 采集完成：共 ${totalCollected} 条`);
  return { success: true, totalCollected, logs: log };
}

/**
 * 热搜榜单采集（每 30 分钟触发一次）
 */
export async function collectHotSearch(env, onNewPost) {
  const db = new Database(env);
  await db.init();
  const log = [];
  let totalImported = 0;

  for (const source of HOT_SEARCH_SOURCES) {
    log.push(`🔥 抓取 ${source.name}`);
    try {
      const fetcher = HOT_FETCHERS[source.fetchFn];
      if (!fetcher) { log.push(`  ⚠ 未知抓取器`); continue; }
      const allItems = await fetcher(env);
      // 热搜每个榜单取前 10 条高热度条目，防止淹没 RSS 专业分类
      const items = (allItems || []).slice(0, 10);

      for (const item of items) {
        if (!item.title) continue;
        const kvKey = `pn:hot:${source.id}:${(await hashKey(item.title)).slice(0, 40)}`;
        const imported = await env.suyuankv.get(kvKey);
        if (imported) continue;

        // 语义智能分类热搜（如科技、AI、商业热点自动分流，其余保留综合）
        const category = detectCategory(item.title, item.description || '', 'general');

        const hotContent = [
          `**热搜排名**：#${item.rank}　**热度**：${item.hotValue || 'N/A'}`,
          '',
          item.description || `来自 ${source.name} 的第 ${item.rank} 位热搜话题。`,
          '',
          '---',
          '',
          `**来源**：${source.name} ${source.icon}`,
          item.link ? `**查看详情**：[点击跳转](${item.link})` : '',
          '',
          '*本文由 万象热搜采集器 自动抓取*'
        ].filter(Boolean).join('\n');

        const rankPenalty = source.id === 'weibo' ? 5 : 3; // 微博热搜降权，减少综合资讯中微博占比
        const hotScore = Math.max(0, Math.min(100, 100 - (item.rank * rankPenalty) + Math.floor((item.hotValue || 0) / 10000)));
        const summary = extractSummary(hotContent, item.title);
        const tags = `热搜,${category}`;
        const newId = await db.createPost(0, `热搜Bot (${source.name})`, item.title, hotContent, tags, hotScore, category, source.name, summary);
        if (onNewPost && newId) {
          onNewPost(newId, item.title, hotContent, source.name);
        }
        await env.suyuankv.put(kvKey, 'true', { expirationTtl: 2 * 60 * 60 });
        totalImported++;
      }
      log.push(`  ✓ 入库 ${items.length > 0 ? Math.min(items.length, 10) : 0} 条`);
    } catch (err) {
      log.push(`  ❌ 失败: ${err.message}`);
    }
  }

  log.push(`📊 热搜采集完成：共 ${totalImported} 条`);
  return { success: true, totalImported, logs: log };
}
