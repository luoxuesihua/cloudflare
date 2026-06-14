import { Database } from '../db.js';

// 定义采集源及其默认标签 (只收集中文)
const FEEDS = [
  {
    url: 'https://www.solidot.org/index.rss',
    name: 'Solidot',
    defaultTags: ['科技'],
    lang: 'zh'
  },
  {
    url: 'https://www.ruanyifeng.com/blog/atom.xml',
    name: '阮一峰的网络日志',
    defaultTags: ['科技'],
    lang: 'zh'
  },
  {
    url: 'https://www.jiqizhixin.com/rss',
    name: '机器之心 AI',
    defaultTags: ['AI'],
    lang: 'zh'
  },
  {
    url: 'https://tech.meituan.com/feed',
    name: '美团技术团队',
    defaultTags: ['运维'],
    lang: 'zh'
  },
  {
    url: 'https://www.oschina.net/news/rss',
    name: '开源中国',
    defaultTags: ['科技'],
    lang: 'zh'
  },
  {
    url: 'http://feed.cnblogs.com/blog/picked/rss',
    name: '博客园精华区',
    defaultTags: ['科技'],
    lang: 'zh'
  },
  {
    url: 'https://segmentfault.com/feeds/blogs',
    name: 'SegmentFault 思否',
    defaultTags: ['科技'],
    lang: 'zh'
  },
  {
    url: 'https://rsshub.moeyy.cn/juejin/trending/all/weekly',
    name: '掘金全站周榜',
    defaultTags: ['科技'],
    lang: 'zh',
    urlBackup: [
      'https://rsshub.rss.geek.zone/juejin/trending/all/weekly',
      'https://rsshub.mxdawn.cc/juejin/trending/all/weekly',
      'https://rsshub.icu/juejin/trending/all/weekly',
      'https://rsshub.app/juejin/trending/all/weekly'
    ]
  }
];



// AI 相关的关键字
const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'artificial-intelligence', 'llm', 'gpt', 
  'claude', 'transformer', 'openai', 'hugging face', 'huggingface', 'ml', 
  'machine learning', 'deep learning', 'langchain', 'agent', 'neural network',
  'copilot', 'midjourney', 'stable diffusion', 'llama', 'gemini',
  '人工智能', '机器学习', '深度学习', '大模型', '语言模型', '智能体', '神经网络',
  '图模型', '提示词', '微调', '生成式'
];

// 运维相关的关键字
const OPS_KEYWORDS = [
  'devops', 'sre', 'sysadmin', 'kubernetes', 'k8s', 'docker', 'cloud native', 
  'cloud-native', 'ci/cd', 'deployment', 'monitoring', 'grafana', 'prometheus', 
  'ansible', 'terraform', 'server', 'backend', 'linux', 'cluster', 'database',
  'mysql', 'postgresql', 'nginx', 'apache', 'linux', 'ubuntu', 'centos',
  '运维', '容器', '监控', '集群', '部署', '云原生', '微服务', '持续集成', '服务器',
  '数据库', '架构师', '可观测性', '高可用', '负载均衡', '容器化'
];

/**
 * 将 HTML 内容转换为干净的 Markdown 格式
 */
function htmlToMarkdown(html) {
  if (!html) return '';
  let text = html;
  
  // 移除 script 和 style 标签及其内容
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // 转换常见 HTML 标签
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n### $1\n\n');
  
  // 移除其余所有 HTML 标签
  text = text.replace(/<[^>]+>/g, '');
  
  // 还原常见的 HTML 实体字符
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
    
  return text.trim();
}

/**
 * 智能分类新闻，判断是属于 AI 还是 运维 还是 科技
 */
function classifyNews(title, desc, defaultTags = []) {
  const contentToSearch = `${title} ${desc}`.toLowerCase();
  const tags = new Set(defaultTags);

  const hasAI = AI_KEYWORDS.some(keyword => contentToSearch.includes(keyword));
  const hasOps = OPS_KEYWORDS.some(keyword => contentToSearch.includes(keyword));

  if (hasAI) tags.add('AI');
  if (hasOps) tags.add('运维');
  
  // 如果都没有匹配，且默认标签里有“科技”，就保持
  if (tags.size === 0) {
    tags.add('科技');
  }

  // 保证输出的标签列表干净整洁
  return Array.from(tags).join(', ');
}

/**
 * 核心新闻采集服务
 */
export async function collectNews(env) {
  const db = new Database(env);
  await db.init(); // 确保 D1 数据库表初始化
  
  let totalCollected = 0;
  const log = [];

  for (const feed of FEEDS) {
    log.push(`开始抓取源: ${feed.name} (${feed.url})`);
    try {
      // 增加超时控制和常规 User-Agent 伪装，避免被部分 RSS 限制，支持备份源轮询
      let response;
      const urlsToTry = feed.urlBackup ? [feed.url, ...feed.urlBackup] : [feed.url];
      let lastError = null;

      for (const url of urlsToTry) {
        try {
          response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RinNewsCollector/1.0',
              'Accept': 'application/xml, text/xml, */*'
            },
            cf: {
              cacheTtl: 300 // 缓存 5 分钟
            }
          });
          if (response.ok) {
            lastError = null;
            break;
          } else {
            lastError = new Error(`HTTP 状态码异常: ${response.status} (地址: ${url})`);
          }
        } catch (err) {
          lastError = err;
        }
      }

      if (lastError) {
        throw lastError;
      }


      const xmlText = await response.text();
      
      // 提取 <item> (RSS) 或 <entry> (Atom)
      const items = [];
      const itemRegex = /<(item|entry)>([\s\S]*?)<\/\1>/g;
      let match;
      
      while ((match = itemRegex.exec(xmlText)) !== null) {
        items.push(match[2]);
      }

      log.push(`  - 解析出 ${items.length} 条原始项目`);

      let feedCollectedCount = 0;

      for (const itemContent of items) {
        // 1. 提取标题
        const titleMatch = itemContent.match(/<title(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        // 2. 提取链接
        let link = '';
        const rssLinkMatch = itemContent.match(/<link(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
        if (rssLinkMatch && rssLinkMatch[1].trim()) {
          link = rssLinkMatch[1].trim();
        } else {
          // Atom 格式 link 匹配: <link rel="alternate" href="url"/> 或 <link href="url"/>
          const atomLinkMatch = itemContent.match(/<link\s+[^>]*href=["']([^"']+)["']/i);
          if (atomLinkMatch) {
            link = atomLinkMatch[1].trim();
          }
        }

        if (!title || !link) continue;

        // 3. 提取描述/内容
        let description = '';
        const descMatch = itemContent.match(/<(content:encoded|content|description|summary)(?:[^>]*)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/\1>/i);
        if (descMatch) {
          description = descMatch[2].trim();
        }

        // 4. 数据去重 (KV 键名为 base64 编码的链接)
        const kvKey = `news:imported:${btoa(encodeURIComponent(link)).replace(/=/g, '')}`;
        const isImported = await env.suyuankv.get(kvKey);
        
        if (isImported) {
          continue; // 已采集，跳过
        }

        // 5. 格式化和分类
        const markdownDesc = htmlToMarkdown(description);
        const tags = classifyNews(title, markdownDesc, feed.defaultTags);

        // 我们只保留 AI 和 运维 标签的文章，如果过滤出来的标签不包含 AI 和 运维，我们跳过它（除了 Solidot/阮一峰等极高质量源，也做同样的过滤以保证内容集中）
        const hasAITag = tags.includes('AI');
        const hasOpsTag = tags.includes('运维');
        if (!hasAITag && !hasOpsTag) {
          continue; // 不相关的主题，跳过
        }

        // 拼接 Markdown 正文
        let formattedContent = markdownDesc;
        // 如果内容太长，适当截取前 2000 字，防止撑爆 D1 单元
        if (formattedContent.length > 2000) {
          formattedContent = formattedContent.substring(0, 2000) + '... (正文过长已截取)';
        }
        
        formattedContent += `\n\n---\n*本文由 AI 收集器自动抓取。来源: [阅读原文](${link})*`;

        // 6. 写入 D1 数据库
        // 用户 ID = 0, 用户名 = 'NewsBot' 代表系统自动采集
        await db.createPost(0, 'NewsBot', title, formattedContent, tags);

        // 7. 写入 KV 去重标记，有效期 14 天
        await env.suyuankv.put(kvKey, 'true', { expirationTtl: 14 * 24 * 60 * 60 });
        
        feedCollectedCount++;
        totalCollected++;

        // 每次抓取同一个源最多录取 5 条最新新闻，防止初次部署时瞬间塞入过多旧历史
        if (feedCollectedCount >= 5) {
          log.push(`  - 达到单次采集上限(5条)，停止解析此源的其余条目`);
          break;
        }
      }
      log.push(`  - 成功导入 ${feedCollectedCount} 条新闻`);

    } catch (err) {
      log.push(`❌ 抓取源 ${feed.name} 失败: ${err.message}`);
    }
  }

  log.push(`采集任务结束。本次共自动收集新闻: ${totalCollected} 条`);
  return {
    success: true,
    totalCollected,
    logs: log
  };
}
