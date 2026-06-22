// BB-Code -> HTML рендер для редактора документов.
//
// Ключевая идея редактируемого предпросмотра: BB-Code разбивается на токены
// (теги и текстовые фрагменты). Теги при рендере сохраняются как есть, а каждый
// ТЕКСТОВЫЙ фрагмент оборачивается в <span data-tr="i">. При правке справа мы
// читаем текст этих span'ов и подставляем обратно ТОЛЬКО в соответствующие
// текстовые фрагменты — теги и их атрибуты остаются нетронутыми.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- санитайзеры ----------
function sanitizeColor(c) {
  return c && /^[a-z0-9#(),.\s%]+$/i.test(c) ? c.trim() : 'inherit';
}

function sanitizeSize(n) {
  const v = String(n || '').trim();
  if (/^\d+(px|pt|em|rem|%)$/i.test(v)) return v;
  const num = parseInt(v, 10);
  if (Number.isNaN(num)) return '14px';
  if (num <= 7) {
    const scale = [11, 12, 14, 17, 21, 26, 32];
    return `${scale[num - 1] || 14}px`;
  }
  return `${Math.min(Math.max(num, 8), 96)}px`;
}

function sanitizeFont(f) {
  const v = String(f || '').trim();
  return /^[a-z0-9 ,'"\-]+$/i.test(v) ? v.replace(/"/g, '') : 'inherit';
}

function cssLen(v) {
  const s = String(v || '').trim();
  if (/^\d+(\.\d+)?(px|%|em|rem|pt|vw)$/i.test(s)) return s;
  if (/^\d+$/.test(s)) return `${s}px`;
  return null;
}

function sanitizeUrl(u) {
  const url = String(u || '').trim();
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return url.replace(/["'<>]/g, '');
  return '#';
}

// ---------- токенизация ----------
function parseTag(interior) {
  if (interior[0] === '/') {
    return { type: 'close', name: interior.slice(1).trim().toLowerCase() };
  }
  const m = interior.match(/^([a-zA-Z0-9*]+)([\s\S]*)$/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const rest = m[2];
  let value = null;
  const attrs = {};
  if (rest.startsWith('=')) {
    value = rest.slice(1).trim().replace(/^"|"$/g, '');
  } else if (rest.trim()) {
    const re = /([a-zA-Z]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = re.exec(rest))) attrs[a[1].toLowerCase()] = a[2];
  }
  return { type: 'open', name, value, attrs };
}

// Возвращает плоский массив токенов; у каждого есть индекс i (позиция в массиве).
export function tokenize(input) {
  const tokens = [];
  const push = (tok) => {
    tok.i = tokens.length;
    tokens.push(tok);
  };
  const re = /\[[^[\]]+\]/g;
  let last = 0;
  let m;
  const str = String(input ?? '');
  while ((m = re.exec(str))) {
    if (m.index > last) push({ kind: 'text', v: str.slice(last, m.index) });
    const parsed = parseTag(m[0].slice(1, -1));
    if (!parsed) push({ kind: 'text', v: m[0] });
    else if (parsed.type === 'close') push({ kind: 'close', name: parsed.name, raw: m[0] });
    else push({ kind: 'open', name: parsed.name, value: parsed.value, attrs: parsed.attrs, raw: m[0] });
    last = re.lastIndex;
  }
  if (last < str.length) push({ kind: 'text', v: str.slice(last) });
  return tokens;
}

// Реконструкция BB-Code из токенов: текст берём из edits (если есть), теги — raw.
export function reconstruct(tokens, edits) {
  return tokens
    .map((tok) => {
      if (tok.kind === 'text') return edits && tok.i in edits ? edits[tok.i] : tok.v;
      return tok.raw;
    })
    .join('');
}

// ---------- дерево (с авто-закрытием незакрытых тегов) ----------
const VOID_TAGS = new Set(['hr', 'br', '*']);
const RAW_TAGS = new Set(['img']); // содержимое — это атрибут (URL), не редактируемый текст

function buildTree(tokens) {
  const root = { name: 'root', children: [] };
  const stack = [root];
  for (const tok of tokens) {
    const top = stack[stack.length - 1];
    if (tok.kind === 'text') {
      top.children.push({ kind: 'text', v: tok.v, i: tok.i });
    } else if (tok.kind === 'open') {
      const node = { name: tok.name, value: tok.value, attrs: tok.attrs || {}, children: [] };
      top.children.push(node);
      if (!VOID_TAGS.has(tok.name)) stack.push(node);
    } else {
      let idx = -1;
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].name === tok.name) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) stack.length = idx;
    }
  }
  return root;
}

// Блочные теги: каждый занимает свою строку, а переносы строк, стоящие
// вплотную к ним, считаются «структурными» и не дают лишних пустых строк.
const BLOCK_TAGS = new Set([
  'indent', 'center', 'right', 'left', 'justify', 'list', 'table', 'tr', 'td', 'th',
  'quote', 'h1', 'h2', 'h3', 'hr',
]);

const isBlock = (node) => node && node.kind !== 'text' && BLOCK_TAGS.has(node.name);

function collectText(node) {
  if (node.kind === 'text') return node.v;
  if (!node.children) return '';
  return node.children.map(collectText).join('');
}

// ---------- рендер ----------
const RENDERERS = {
  b: (_v, _a, inner) => `<strong>${inner}</strong>`,
  i: (_v, _a, inner) => `<em>${inner}</em>`,
  u: (_v, _a, inner) => `<u>${inner}</u>`,
  s: (_v, _a, inner) => `<s>${inner}</s>`,
  color: (v, _a, inner) => `<span style="color:${sanitizeColor(v)}">${inner}</span>`,
  size: (v, _a, inner) => `<span style="font-size:${sanitizeSize(v)}">${inner}</span>`,
  font: (v, _a, inner) => `<span style="font-family:${sanitizeFont(v)}">${inner}</span>`,
  center: (_v, _a, inner) => `<div style="text-align:center">${inner}</div>`,
  right: (_v, _a, inner) => `<div style="text-align:right">${inner}</div>`,
  left: (_v, _a, inner) => `<div style="text-align:left">${inner}</div>`,
  justify: (_v, _a, inner) => `<div style="text-align:justify">${inner}</div>`,
  indent: (_v, _a, inner) => `<div class="bb-indent">${inner}</div>`,
  quote: (_v, _a, inner) => `<blockquote>${inner}</blockquote>`,
  h1: (_v, _a, inner) => `<h1>${inner}</h1>`,
  h2: (_v, _a, inner) => `<h2>${inner}</h2>`,
  h3: (_v, _a, inner) => `<h3>${inner}</h3>`,
  hr: () => '<hr>',
  br: () => '<br>',
  url: (v, _a, inner, raw) => {
    const href = sanitizeUrl(v || raw);
    return `<a href="${href}" target="_blank" rel="noopener">${inner || escapeHtml(raw)}</a>`;
  },
  img: (_v, attrs, _inner, raw) => {
    const w = cssLen(attrs.width);
    const h = cssLen(attrs.height);
    const style = [w && `width:${w}`, h && `height:${h}`].filter(Boolean).join(';');
    return `<img src="${sanitizeUrl(raw.trim())}"${style ? ` style="${style}"` : ''} alt="">`;
  },
  table: (_v, _a, inner) => `<table class="bb-table">${inner}</table>`,
  tr: (_v, _a, inner) => `<tr>${inner}</tr>`,
  td: (_v, _a, inner) => `<td>${inner}</td>`,
  th: (_v, _a, inner) => `<th>${inner}</th>`,
  list: (_v, _a, _inner, _raw, node) => renderList(node),
};

function renderNode(node, editable, indices) {
  if (node.kind === 'text') {
    if (editable) {
      indices.push(node.i);
      return `<span class="bb-tr" data-tr="${node.i}">${escapeHtml(node.v)}</span>`;
    }
    return escapeHtml(node.v);
  }
  if (node.name === 'list') return renderList(node, editable, indices);

  // raw-теги (img): содержимое не редактируется как текст.
  if (RAW_TAGS.has(node.name)) {
    const fn = RENDERERS[node.name];
    return fn ? fn(node.value, node.attrs || {}, '', collectText(node), node) : '';
  }

  const inner = renderChildren(node, editable, indices);
  const fn = RENDERERS[node.name];
  if (!fn) return inner; // неизвестный тег — показываем только содержимое
  return fn(node.value, node.attrs || {}, inner, collectText(node), node);
}

// Рендерит детей узла, убирая «структурные» переносы строк между блоками
// (чтобы блочные теги не давали двойных пустых строк, как на форуме).
function renderChildren(node, editable, indices) {
  const kids = node.children;
  const containerBlock = node.name === 'root' || BLOCK_TAGS.has(node.name);
  let out = '';
  for (let k = 0; k < kids.length; k++) {
    const child = kids[k];
    // текстовый токен только из пробелов/переносов и содержащий перенос
    if (child.kind === 'text' && /^\s*$/.test(child.v) && child.v.includes('\n')) {
      const prevBlock = k === 0 ? containerBlock : isBlock(kids[k - 1]);
      const nextBlock = k === kids.length - 1 ? containerBlock : isBlock(kids[k + 1]);
      if (prevBlock || nextBlock) continue; // перенос между блоками — пропускаем
    }
    out += renderNode(child, editable, indices);
  }
  return out;
}

function renderList(node, editable, indices) {
  const ordered = ['1', 'a', 'A', 'i', 'I'].includes(node.value);
  const items = [];
  let current = null;
  for (const ch of node.children) {
    if (ch.kind === 'text' && /^\s*$/.test(ch.v)) continue; // пробелы/переносы между пунктами
    if (ch.name === '*') {
      if (current !== null) items.push(current);
      current = '';
    } else {
      if (current === null) current = '';
      current += renderNode(ch, editable, indices);
    }
  }
  if (current !== null) items.push(current);
  const lis = items.map((x) => `<li>${x}</li>`).join('');
  return ordered ? `<ol>${lis}</ol>` : `<ul>${lis}</ul>`;
}

// Рендер токенов в HTML. Возвращает { html, indices } —
// indices = индексы текстовых токенов, обёрнутых в редактируемые span'ы.
export function tokensToHtml(tokens, editable = false) {
  const tree = buildTree(tokens);
  const indices = [];
  const html = renderChildren(tree, editable, indices);
  return { html, indices };
}

// Удобная обёртка для нередактируемого рендера.
export function bbcodeToHtml(input) {
  return tokensToHtml(tokenize(input), false).html;
}
