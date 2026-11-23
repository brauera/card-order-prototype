// Run in the browser on http://localhost:8765/index.html (javascript tool).
// Returns every translatable text "unit" of the prototype: the full text of the
// innermost element that holds only text + inline tags, with data-slot children
// written as {slot-name}. The runtime translator (i18n in app.js) matches the
// same units, so dictionary "src" strings must equal these exactly.
(() => {
  const INLINE = new Set(['BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'A', 'SMALL', 'SUP', 'SUB', 'U']);
  const norm = s => s.replace(/[ ​]/g, ' ').replace(/\s+/g, ' ').trim();
  const unitText = el => {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        if (n.dataset && n.dataset.slot) s += '{' + n.dataset.slot + '}';
        else if (n.tagName === 'BR') s += ' ';
        else s += unitText(n);
      }
    }
    return s;
  };
  const isUnit = el => {
    if (!el.textContent.trim()) return false;
    for (const c of el.children) {
      if (!INLINE.has(c.tagName)) return false;
      if (c.querySelector('*:not(br):not(span):not(b):not(strong):not(i):not(em):not(a):not(small)')) return false;
    }
    return true;
  };
  const units = new Map();
  const add = (s, where) => { if (!units.has(s)) units.set(s, new Set()); units.get(s).add(where); };
  for (const t of document.querySelectorAll('template[data-screen]')) {
    const root = t.content.firstElementChild; if (!root) continue;
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || !isUnit(el)) continue;
      if (el.parentElement && all.includes(el.parentElement) && isUnit(el.parentElement)) continue;
      const s = norm(unitText(el));
      if (!s || s.length < 2 || /^[\d\s.,:%₼$€•+\-−()\/×·|*'"]+$/.test(s)) continue;
      add(s, t.dataset.screen);
    }
    root.querySelectorAll('[placeholder]').forEach(i => { const s = norm(i.getAttribute('placeholder')); if (s) add(s, t.dataset.screen + '#placeholder'); });
  }
  return [...units].map(([k, v]) => ({ src: k, screens: [...v] }));
})();
