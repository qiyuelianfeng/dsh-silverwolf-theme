/**
 * BWIKI（wiki.biligame.com/sr）角色页 wikitext → 世界书条目。
 *
 * 数据源是 MediaWiki 的 `action=raw` 返回的 wikitext，角色页用
 * `{{角色图鉴 |参数=值 ...}}` 模板承载档案与角色故事。
 * 这里只做纯解析：入参是一段 wikitext，出参是 sanitizeEntries 能吃的条目数组。
 * 不碰网络、不碰文件系统——抓取由调用方（build-worldbook.mjs / index.js）负责。
 */

/** wikitext 里的 HTML 实体 + 简单标签清洗（复刻原 worldbook.js 的 stripHtml 思路）。 */
const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function stripHtml(input) {
  let text = String(input ?? '')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n\n')
  text = text.replace(/<li[^>]*>/gi, '- ')
  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/&[a-z#0-9]+;/gi, (token) => ENTITIES[token.toLowerCase()] ?? token)
  text = text.replace(/\r/g, '')
  text = text.replace(/[ \t\u00a0]+/g, ' ')
  text = text.replace(/ *\n */g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/** 从 wikitext 里抠出「参数=值」两列（模板里多行 `|参数=值`）。 */
function parseTemplateParams(body) {
  const params = {}
  const lines = body.split(/\n/)
  for (const line of lines) {
    const m = /^\|([^=|]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    const key = m[1].trim()
    const value = m[2].trim()
    if (key !== '' && value !== '') params[key] = value
  }
  return params
}

/** 取出第一个 `{{角色图鉴 ... }}` 模板的正文（模板名后到第一个未嵌套的 `}}`）。 */
function extractRoleTemplate(wikitext) {
  const start = wikitext.indexOf('{{角色图鉴')
  if (start === -1) return ''
  // 从模板名后开始，数 {{ 与 }} 的嵌套深度，找到配对结束。
  let depth = 0
  let i = start
  while (i < wikitext.length) {
    if (wikitext.startsWith('{{', i)) {
      depth += 1
      i += 2
      continue
    }
    if (wikitext.startsWith('}}', i)) {
      depth -= 1
      i += 2
      if (depth === 0) break
      continue
    }
    i += 1
  }
  return wikitext.slice(start, i)
}

const NAME_MAX = 80
const CONTENT_MAX = 6000
const ENTRY_MIN = 30

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

function buildEntry({ id, character, category, name, keys, content }) {
  const body = String(content || '').trim().slice(0, CONTENT_MAX)
  if (body.length < ENTRY_MIN) return null
  return {
    id: String(id).slice(0, 64),
    character: cleanName(character),
    category,
    name: cleanName(name),
    keys: Array.from(new Set([character, ...keys].map((k) => String(k || '').trim()).filter(Boolean))).slice(0, 12),
    content: body,
  }
}

/**
 * 把一页角色 wikitext 解析成世界书条目。
 * @param {string} wikitext
 * @returns {Array} 条目数组（可能为空）
 */
export function parseCharacterWikitext(wikitext) {
  if (typeof wikitext !== 'string' || wikitext.trim() === '') return []
  const template = extractRoleTemplate(wikitext)
  if (template === '') return []
  const params = parseTemplateParams(template)

  const name = cleanName(params['名称'])
  if (name === '') return []

  const entries = []
  // id 必须是 ASCII（sanitizeEntries 只认 [a-z0-9-]）：按角色名映射到稳定的英文前缀。
  const idMap = { 银狼: 'silverwolf', '银狼LV.999': 'silverwolf-lv999', '银狼LV999': 'silverwolf-lv999' }
  const cid = `wiki-${idMap[name] || 'char'}`

  // 档案：把关键字段拼成键值对。
  const archiveLines = []
  const pushField = (label, value) => {
    const v = stripHtml(value)
    if (v !== '') archiveLines.push(label === '' ? v : `${label}：${v}`)
  }
  pushField('外文名', params['外文名'])
  pushField('称号', params['称号'])
  pushField('命途', params['命途'])
  pushField('属性', params['元素属性'])
  pushField('阵营', params['阵营'])
  pushField('稀有度', params['稀有度'])
  pushField('体型', params['体型'])
  pushField('实装版本', params['实装版本'])
  pushField('实装日期', params['实装日期'])
  pushField('中文CV', params['中文CV'])
  pushField('卷首语', params['卷首语'])
  pushField('短信签名', params['短信签名'])
  pushField('', params['介绍'])
  if (archiveLines.length > 0) {
    const entry = buildEntry({
      id: `${cid}-archive`,
      character: name,
      category: 'archive',
      name: `${name} · 档案`,
      keys: [name, params['外文名']].filter(Boolean),
      content: archiveLines.join('\n'),
    })
    if (entry) entries.push(entry)
  }

  // 角色详细（总览介绍）。
  const detail = stripHtml(params['角色详细'])
  if (detail !== '') {
    const entry = buildEntry({
      id: `${cid}-detail`,
      character: name,
      category: 'analysis',
      name: `${name} · 简介`,
      keys: [name],
      content: detail,
    })
    if (entry) entries.push(entry)
  }

  // 角色故事 1–4。
  for (let n = 1; n <= 4; n += 1) {
    const story = stripHtml(params[`角色故事${n}`])
    if (story === '') continue
    const entry = buildEntry({
      id: `${cid}-story-${n}`,
      character: name,
      category: 'story',
      name: `${name} · 角色故事（${n}）`,
      keys: [name, '角色故事'],
      content: story,
    })
    if (entry) entries.push(entry)
  }

  // 定位（战斗定位，若页里有）。
  const role = stripHtml(params['角色定位'])
  if (role !== '') {
    const entry = buildEntry({
      id: `${cid}-role`,
      character: name,
      category: 'analysis',
      name: `${name} · 定位`,
      keys: [name, '定位'],
      content: role,
    })
    if (entry) entries.push(entry)
  }

  return entries
}
