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
 * 结构化 AI 导读分析（借鉴 AIHOT 规则：答案先行摘要 + 自洽标题 + 核心看点 + 适合人群 + 注意力评分）
 */
export async function generateAIInsights(env, title, content, sourceName = '') {
  if (!env.AI) return null;

  const cleaned = cleanForAI(content);
  if (!cleaned) return null;

  const textToSummarize = truncateForAI(cleaned, 3500);

  const systemPrompt = `你是一个行业情报分析与资讯导读引擎。请对输入的资讯进行深度分析与信息提炼。

【规则一：标题自洽与主体补齐】
1. 检查标题是否包含明确主体（产品名/模型名/公司名/关键人物/项目名）。
2. 若原标题缺少主体或仅为无信息量代号（如 "v2.1.0"、"重磅更新"、"Day 1"），结合信源与正文提取核心主体，生成 improved_title。若原标题已清晰自洽，improved_title 与原标题一致。

【规则二：答案先行摘要 (Answer-First Summary)】
1. 摘要第一句必须直接给答案，明确说明“谁在何时做了什么、关键结果/变化是什么”（35-70字）。
2. 严禁使用“本文介绍了”、“文章讨论了”、“据报道”、“作者表示”等一切转述套话开篇。
3. 后续补充1-2个最重要的核心事实、数据或影响，总字数80-140字。

【规则三：核心看点与读者价值 (Takeaway & Audience)】
1. takeaway：用极其精炼的一句话（25字以内）说明“为什么值得看/核心看点”。
2. target_audience：用几个词说明“谁最适合参考”（如：开发者、架构师、产品经理、创业者、普通读者）。

【规则四：五轴注意力评分与噪声压制 (0-100)】
综合评估实质分量、信息增量、证据强度、共振面与可用性：
- 重大突破/主流开源/实用工具/核心产品更新：75-95分
- 有价值的行业分析/深度教程/实用技巧：60-74分
- 缺乏数据的公关软文、例行小版本修复、营销炒作、模糊预告：直接压制在40分以下。

请严格仅以合法 JSON 格式输出，不要输出任何非 JSON 字符：
{
  "improved_title": "...",
  "summary": "...",
  "takeaway": "...",
  "target_audience": "...",
  "attention_score": 75
}`;

  try {
    const response = await env.AI.run(
      '@cf/meta/llama-3.2-3b-instruct',
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `【信源名称】${sourceName || '未知'}\n【原文标题】${title}\n\n【正文节选】\n${textToSummarize}` }
        ],
        max_tokens: 380,
        temperature: 0.2
      }
    );

    const raw = response?.response || response?.choices?.[0]?.message?.content || '';
    if (!raw) return null;

    let parsed = null;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }

    if (parsed && (parsed.summary || parsed.takeaway)) {
      return {
        improvedTitle: parsed.improved_title && parsed.improved_title !== title ? parsed.improved_title.trim() : null,
        summary: (parsed.summary || '').trim().replace(/^(摘要|AI摘要|核心内容)[：:]\s*/i, ''),
        takeaway: (parsed.takeaway || '').trim(),
        targetAudience: (parsed.target_audience || '').trim(),
        attentionScore: typeof parsed.attention_score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.attention_score))) : 60
      };
    }

    const fallbackText = raw.trim().replace(/^(摘要|AI摘要|核心内容)[：:]\s*/i, '');
    if (fallbackText.length > 5) {
      return {
        improvedTitle: null,
        summary: fallbackText.slice(0, 200),
        takeaway: '',
        targetAudience: '',
        attentionScore: 50
      };
    }

    return null;
  } catch (e) {
    console.warn('AI Insights 生成失败:', e.message);
    return null;
  }
}

/**
 * 兼容旧调用的基础 AI 摘要生成
 */
export async function generateAISummary(env, title, content, sourceName = '') {
  const insights = await generateAIInsights(env, title, content, sourceName);
  return insights ? insights.summary : null;
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
 * 异步生成并持久化 AI 摘要与深度导读（不阻塞主流程）
 */
export async function asyncAISummarize(env, postId, title, content, sourceName = '') {
  try {
    const insights = await generateAIInsights(env, title, content, sourceName);
    if (insights) {
      const db = new Database(env);
      await db.updatePostAIInsights(postId, {
        aiSummary: insights.summary,
        takeaway: insights.takeaway,
        targetAudience: insights.targetAudience,
        attentionScore: insights.attentionScore,
        improvedTitle: insights.improvedTitle
      });
      console.log(`AI 深度导读生成成功: post#${postId} (score: ${insights.attentionScore})`);
    }
  } catch (e) {
    // 静默失败，不阻塞主流程
    console.warn(`AI 摘要异步生成失败: post#${postId}`, e.message);
  }
}
