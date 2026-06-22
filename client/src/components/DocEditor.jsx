import { useEffect, useRef } from 'react';
import { tokenize, tokensToHtml, reconstruct } from '../lib/bbcode.js';

// Левая половина — BB-Code (источник истины). Правая — предпросмотр.
// Правка справа меняет ТОЛЬКО текст соответствующих фрагментов в BB-Code;
// теги и их атрибуты (размеры, цвета, шрифты, отступы) остаются нетронутыми.
export default function DocEditor({ value, onChange, editable }) {
  const previewRef = useRef(null);
  const focused = useRef(false);
  const renderedTokens = useRef([]); // токены, по которым отрисован текущий DOM
  const editableIndices = useRef([]); // индексы текстовых токенов с редактируемыми span'ами

  // Перерисовываем предпросмотр при изменении BB-Code слева
  // (но не пока курсор внутри предпросмотра — чтобы не сбивать ввод).
  useEffect(() => {
    if (!previewRef.current || focused.current) return;
    const tokens = tokenize(value);
    const { html, indices } = tokensToHtml(tokens, editable);
    renderedTokens.current = tokens;
    editableIndices.current = indices;
    previewRef.current.innerHTML = html;
  }, [value, editable]);

  // Считываем текст из помеченных span'ов и пересобираем BB-Code.
  const syncFromPreview = () => {
    if (!editable || !previewRef.current) return;
    const edits = {};
    // фрагменты, которые были отрисованы, но пропали из DOM (удалены) -> пустые
    editableIndices.current.forEach((i) => {
      edits[i] = '';
    });
    previewRef.current.querySelectorAll('span.bb-tr').forEach((sp) => {
      edits[Number(sp.dataset.tr)] = sp.textContent;
    });
    onChange(reconstruct(renderedTokens.current, edits));
  };

  // Enter вставляем как перенос строки внутрь текущего текста,
  // а не как новый блок (иначе ломается структура).
  const onKeyDown = (e) => {
    if (!editable || e.key !== 'Enter') return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tn = document.createTextNode('\n');
    range.insertNode(tn);
    range.setStartAfter(tn);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    syncFromPreview();
  };

  return (
    <div className="doc-editor">
      <div className="doc-pane">
        <div className="doc-pane-head">BB-Code</div>
        <textarea
          className="doc-source"
          value={value}
          readOnly={!editable}
          spellCheck={false}
          placeholder={editable ? 'Введите BB-Code документа…' : 'Документ пуст'}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="doc-pane">
        <div className="doc-pane-head">
          Предпросмотр{editable ? ' · правка справа меняет только текст' : ''}
        </div>
        <div
          ref={previewRef}
          className="doc-preview"
          contentEditable={editable}
          suppressContentEditableWarning
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
          }}
          onInput={syncFromPreview}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
