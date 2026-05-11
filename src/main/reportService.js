function getTodayLocalKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getReportTitle(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日日报`;
}

function isToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return getTodayLocalKey(date) === getTodayLocalKey();
}

function stripHtml(html) {
  if (!html) return '';

  let text = String(html);
  text = text.replace(/<div class="todo-line[\s\S]*?<\/div>/gi, (match) => {
    const checked = /data-checked="true"/i.test(match);
    const body = match
      .replace(/<span class="todo-toggle"[\s\S]*?<\/span>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\u200B/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return body ? `\n${checked ? '[x]' : '[ ]'} ${body}\n` : '\n';
  });

  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\u200B/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectTodayNotes(noteStore) {
  const items = [];

  noteStore.getAllStacks().forEach((stack) => {
    stack.notes.forEach((note) => {
      const updatedAt = note.updatedAt || note.createdAt;
      if (!isToday(updatedAt)) return;

      const text = stripHtml(note.content || '');
      const imageCount = Array.isArray(note.images) ? note.images.length : 0;
      if (!text && !imageCount) return;

      items.push({
        stackId: stack.id,
        noteId: note.id,
        updatedAt,
        text,
        imageCount
      });
    });
  });

  return items.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
}

function buildPromptPayload(notes, settings) {
  return {
    date: getTodayLocalKey(),
    work_content: String(settings.dailyReportWorkContent || '').trim(),
    notes: notes.map((note) => ({
      note_id: note.noteId,
      updated_at: note.updatedAt,
      image_count: note.imageCount,
      content: note.text
    }))
  };
}

async function callDeepSeek({ apiKey, model, payload }) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            '你是一个工作日报助手。',
            'work_content 是用户填写的当前工作内容，可视为轻量 RAG 上下文。',
            '你需要根据 work_content 判断哪些便利贴属于工作信息。',
            '请过滤掉私人、娱乐、购物、生活提醒、闲聊等非工作内容。',
            '输出必须是 JSON，不要输出 Markdown 代码块。'
          ].join('')
        },
        {
          role: 'user',
          content: [
            '请处理下面的当天便利贴数据，并返回 JSON：',
            '{',
            '  "kept_note_ids": ["..."],',
            '  "ignored_note_ids": ["..."],',
            '  "report": "今日完成\\n- ...\\n\\n进行中\\n- ...\\n\\n问题风险\\n- ...\\n\\n明日计划\\n- ..."',
            '}',
            '',
            '要求：',
            '1. 只保留与用户当前工作内容相关的便利贴。',
            '2. report 必须为中文。',
            '3. 如果工作信息有限，也要给出简洁日报并明确说明。',
            '',
            JSON.stringify(payload)
          ].join('\n')
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API 错误：${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseResponseJson(content) {
  const cleaned = String(content || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(cleaned);
}

function buildFallbackReport(notes, settings) {
  const workContent = String(settings.dailyReportWorkContent || '').trim();
  return [
    '今日完成',
    ...notes.slice(0, 6).map((note) => `- ${note.text || `图片 ${note.imageCount} 张`}`),
    '',
    '进行中',
    workContent
      ? `- 当前工作内容参考：${workContent}`
      : '- 尚未填写“工作内容”，建议先补充后再生成更准确的日报',
    '',
    '问题风险',
    '- 当前为本地兜底日报，尚未经过 DeepSeek 工作信息筛选',
    '',
    '明日计划',
    '- 配置 DeepSeek API Key 后重新生成日报'
  ].join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatReportHtml(rawText) {
  return escapeHtml(rawText).replace(/\n/g, '<br>');
}

async function generateDailyReport(noteStore) {
  const settings = noteStore.getSettings();
  const notes = collectTodayNotes(noteStore);
  if (!notes.length) {
    throw new Error('今天还没有可用于生成日报的便利贴内容。');
  }

  const apiKey = String(settings.deepseekApiKey || '').trim();
  const model = String(settings.dailyReportModel || 'deepseek-v4-flash').trim();
  const createdAt = new Date().toISOString();
  const title = getReportTitle(new Date(createdAt));

  let reportText;
  if (!apiKey) {
    reportText = buildFallbackReport(notes, settings);
  } else {
    const content = await callDeepSeek({
      apiKey,
      model,
      payload: buildPromptPayload(notes, settings)
    });
    const parsed = parseResponseJson(content);
    reportText = String(parsed.report || '').trim() || buildFallbackReport(notes, settings);
  }

  const rawText = `${title}\n\n${reportText}`;
  return {
    title,
    createdAt,
    rawText,
    content: formatReportHtml(rawText)
  };
}

module.exports = {
  generateDailyReport
};
