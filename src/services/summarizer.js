/**
 * AI 摘要服务
 * 使用 Cloudflare Workers AI 生成文章摘要和要点提炼
 */
import { Database } from '../db.js';

/**
 * 将 Markdown 内容清理为适合 AI 处理的纯文本
 */
function cleanForAI(text) {
  if (!text) return '';
  return text
    .replace(/---[\s\S]*?---/g, '') // 移除元数据分隔区
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>|~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\*\*.*?\*\*/g, '')
    .trim();
}

/**
 * 截取合适长度的内容给 AI 处理（避免超 token 限制）
 */
function truncateForAI(text, maxChars = 3000) {
  if (!text || text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '…';
}

/**
 * 使用 AI 生成 100 字以内的中文摘要
 * 调用 Cloudflare Workers AI（免费额度）
 */
export async function generateAISummary(env, title, content) {
  // 如果没有 AI 绑定，跳过
  if (!env.AI) return null;

  const cleaned = cleanForAI(content);
  if (!cleaned) return null;

  const textToSummarize = truncateForAI(cleaned);

  try {
    const response = await env.AI.run(
      '@cf/meta/llama-3.2-3b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: '你是一个专业的中文新闻摘要助手。请用1-2句话（不超过100个汉字）概括以下文章的核心内容。只输出摘要本身，不要添加任何解释、前缀或后缀。'
          },
          {
            role: 'user',
            content: `标题：${title}\n\n正文：${textToSummarize}\n\n请生成摘要：`
          }
        ],
        max_tokens: 150,
        temperature: 0.3
      }
    );

    const summary = response?.response || response?.choices?.[0]?.message?.content;
    if (summary && summary.trim().length > 5) {
      return summary.trim().replace(/^(摘要|AI摘要|核心内容)[：:]\s*/i, '');
    }
    return null;
  } catch (e) {
    console.warn('AI 摘要生成失败:', e.message);
    return null;
  }
}

/**
 * 提炼文章核心要点（3-5 条，用于详情页展示）
 */
export async function extractKeyPoints(env, title, content) {
  if (!env.AI) return null;

  const cleaned = cleanForAI(content);
  if (!cleaned) return null;

  const textToSummarize = truncateForAI(cleaned, 4000);

  try {
    const response = await env.AI.run(
      '@cf/meta/llama-3.2-3b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: '你是一个专业的内容提炼助手。请从文章中提取3-5个核心要点，每个要点一行，以"- "开头，每个要点不超过30个汉字。只输出要点列表，不要添加任何解释和标题。'
          },
          {
            role: 'user',
            content: `标题：${title}\n\n正文：${textToSummarize}\n\n请提炼核心要点：`
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      }
    );

    const raw = response?.response || response?.choices?.[0]?.message?.content;
    if (!raw) return null;

    // 解析为数组
    const points = raw
      .split('\n')
      .map(line => line.replace(/^[-*•\d]+[.、\s]*/, '').trim())
      .filter(line => line.length > 3 && line.length < 60);

    return points.length > 0 ? points : null;
  } catch (e) {
    console.warn('AI 要点提炼失败:', e.message);
    return null;
  }
}

/**
 * 异步生成并持久化 AI 摘要（不阻塞主流程）
 * 在采集流程完成后调用此函数，对每条新文章生成 AI 摘要
 */
export async function asyncAISummarize(env, postId, title, content) {
  try {
    const summary = await generateAISummary(env, title, content);
    if (summary) {
      const db = new Database(env);
      await db.updatePostAISummary(postId, summary);
      console.log(`AI 摘要生成成功: post#${postId}`);
    }
  } catch (e) {
    // 静默失败，不阻塞主流程
    console.warn(`AI 摘要异步生成失败: post#${postId}`, e.message);
  }
}
