/**
 * 万象资讯智能语义分类器 (Panorama Smart Classifier)
 * 
 * 基于多维度特征词、加权正则匹配和源倾向度，对采集到的新闻与热搜进行二次分类与分流。
 * 覆盖 6 大分类：general (综合), ai (AI前沿), dev (编程开发), ops (运维架构), product (产品设计), biz (财经商业)
 */

export const CATEGORY_RULES = {
  ai: {
    name: 'AI 前沿',
    regex: /\b(ai|llm|gpt-?[345o]?|chatgpt|openai|claude|deepseek|gemini|sora|midjourney|aigc|agi|transformer|copilot|stable\s?diffusion|ollama|hugging\s?face|langchain|lora|rag|agent|diffusion|mcp|qwen|kimi|glm|moonshot|minimax|nvidia)\b|人工智能|大模型|机器学习|深度学习|多模态|计算机视觉|自然语言处理|神经网络|提示词|算力|英伟达|模型训练|具身智能|智算中心|智能体|文生图|文生视频|语音合成|开源大模型|自动驾驶/i,
    weight: 2.2
  },
  dev: {
    name: '编程开发',
    regex: /\b(github|git|python|javascript|typescript|golang|go|rust|java|c\+\+|php|swift|kotlin|react|vue|vite|node\.?js|next\.?js|flutter|django|spring\s?boot|sql|redis|mysql|postgresql|api|webassembly|wasm|css3?|html5?|sdk|cli|webpack|eslint|tailwind|bun|deno|jit|gil|llvm)\b|编程|开发者|代码仓库|开发指南|源码解析|技术栈|开源软件|开源库|依赖库|技术架构|函数|接口|重构|编译|代码片段|全栈开发|前端|后端|代码/i,
    weight: 1.6
  },
  ops: {
    name: '运维架构',
    regex: /\b(k8s|kubernetes|docker|container|devops|ci\/cd|sre|nginx|apache|prometheus|grafana|kafka|elasticsearch|elk|cloudflare|aws|azure|gcp|linux|serverless|terraform|ansible|cdn|dns|ingress|helm|etcd|pod|istio)\b|负载均衡|容灾|高可用|故障排查|运维|微服务架构|容器化|集群|日志收集|监控告警|中间件|云原生|系统调优|网关|网络架构/i,
    weight: 1.8
  },
  biz: {
    name: '财经商业',
    regex: /\b(ipo|cpi|ppi|gdp|fed)\b|财报|营收|利润|净利润|估值|融资|美联储|降息|加息|央行|通胀|a股|港股|美股|纳斯达克|恒生指数|上证|基金|证券|债市|商业模式|投融资|天使轮|独角兽|上市|市值|并购|创投|宏观经济|关税|汇率|金价|原油|财经|投资|股市|股票|创业公司|电商大促|外汇|理财|出海商业|资本运作|财报披露|券商|加征关税/i,
    weight: 1.8
  },
  product: {
    name: '产品设计',
    regex: /\b(ui|ux|prd|figma|sketch)\b|交互设计|用户体验|产品经理|产品设计|原型设计|需求文档|用户调研|留存率|转化率|增长黑客|设计系统|视觉设计|设计规范|体验设计|产品运营|交互逻辑|原型图|改版设计|界面设计|设计趋势/i,
    weight: 1.8
  }
};

/**
 * 智能分类文章
 * @param {string} title 标题
 * @param {string} content 正文、描述或摘要
 * @param {string} defaultCategory 原始默认分类
 * @returns {string} 修正后的分类 ID (general | ai | dev | ops | product | biz)
 */
export function detectCategory(title = '', content = '', defaultCategory = 'general') {
  // 如果原本是明确的非 general 专业分类，默认信任该源分类（除非没有任何内容）
  if (defaultCategory && defaultCategory !== 'general') {
    return defaultCategory;
  }

  const cleanTitle = (title || '').trim();
  const cleanContent = (content || '').substring(0, 1000).trim();
  const fullText = `${cleanTitle} ${cleanContent}`;

  if (!fullText) return defaultCategory || 'general';

  let bestCategory = defaultCategory || 'general';
  let maxScore = 0;

  for (const [catId, rule] of Object.entries(CATEGORY_RULES)) {
    const textMatches = fullText.match(new RegExp(rule.regex, 'gi')) || [];
    const titleMatches = cleanTitle.match(new RegExp(rule.regex, 'gi')) || [];

    // 标题中命中赋予更高的权值（标题是核心主题）
    const score = (textMatches.length + titleMatches.length * 2.5) * rule.weight;

    if (score > maxScore && score >= 2.0) {
      maxScore = score;
      bestCategory = catId;
    }
  }

  return bestCategory;
}
