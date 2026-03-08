/**
 * JavaScript injected into the landing v3 iframe.
 * Handles hover highlights, click selection, contentEditable text editing,
 * postMessage communication with the parent editor,
 * and incremental section injection from parent.
 */
export function getIframeScript(): string {
  return `
(function() {
  let hoveredEl = null;
  let selectedEl = null;
  const OUTLINE_HOVER = '2px solid #3B82F6';
  const OUTLINE_SELECTED = '2px solid #8B5CF6';

  function getSectionId(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.sectionId) {
        return node.dataset.sectionId;
      }
      node = node.parentElement;
    }
    return null;
  }

  function getSectionElement(sectionId) {
    return document.querySelector('[data-section-id="' + sectionId + '"]');
  }

  function getElementPath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body) {
      let tag = node.tagName.toLowerCase();
      if (node.id) { tag += '#' + node.id; }
      const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(function(c) { return c.tagName === node.tagName; }) : [];
      if (siblings.length > 1) { tag += ':nth(' + siblings.indexOf(node) + ')'; }
      parts.unshift(tag);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function isTextElement(el) {
    var textTags = ['H1','H2','H3','H4','H5','H6','P','SPAN','LI','A','BLOCKQUOTE','LABEL','TD','TH','FIGCAPTION'];
    return textTags.indexOf(el.tagName) !== -1;
  }

  // Hover
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === document.body || el === document.documentElement) return;
    if (el === selectedEl) return;
    if (hoveredEl && hoveredEl !== selectedEl) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
    }
    hoveredEl = el;
    if (el !== selectedEl) {
      el.style.outline = OUTLINE_HOVER;
      el.style.outlineOffset = '-2px';
    }
  });

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl && hoveredEl !== selectedEl) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
    }
    hoveredEl = null;
  });

  // Click — select element
  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;

    // Deselect previous
    if (selectedEl) {
      selectedEl.style.outline = '';
      selectedEl.style.outlineOffset = '';
    }

    if (selectedEl === el) {
      selectedEl = null;
      window.parent.postMessage({ type: 'element-deselected' }, '*');
      return;
    }

    selectedEl = el;

    // Clear hover styles BEFORE capturing openTag (so it matches source HTML)
    el.style.outline = '';
    el.style.outlineOffset = '';
    var openTag = el.outerHTML.substring(0, el.outerHTML.indexOf('>') + 1).substring(0, 120);

    el.style.outline = OUTLINE_SELECTED;
    el.style.outlineOffset = '-2px';

    var rect = el.getBoundingClientRect();
    window.parent.postMessage({
      type: 'element-selected',
      sectionId: getSectionId(el),
      tagName: el.tagName,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      text: (el.textContent || '').substring(0, 200),
      openTag: openTag,
      elementPath: getElementPath(el),
      isSectionRoot: el.dataset && el.dataset.sectionId ? true : false,
    }, '*');
  }, true);

  // Double-click — contentEditable for text
  document.addEventListener('dblclick', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!isTextElement(el)) return;

    el.contentEditable = 'true';
    el.focus();
    el.style.outline = '2px dashed #F59E0B';
    el.style.outlineOffset = '-2px';

    function onBlur() {
      el.contentEditable = 'false';
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKeydown);

      var sid = getSectionId(el);
      var sectionEl = sid ? getSectionElement(sid) : null;
      window.parent.postMessage({
        type: 'text-edited',
        sectionId: sid,
        elementPath: getElementPath(el),
        newText: el.innerHTML,
        sectionHtml: sectionEl ? sectionEl.innerHTML : null,
      }, '*');

      selectedEl = null;
    }

    function onKeydown(ev) {
      if (ev.key === 'Escape') {
        el.blur();
      }
    }

    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKeydown);
  }, true);

  // Listen for messages FROM parent (incremental section injection)
  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || !msg.action) return;

    if (msg.action === 'add-section') {
      var wrapper = document.createElement('div');
      wrapper.setAttribute('data-section-id', msg.id);
      wrapper.innerHTML = msg.html;
      wrapper.style.animation = 'fadeInUp 0.4s ease-out';
      document.body.appendChild(wrapper);
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    if (msg.action === 'update-section') {
      var el = getSectionElement(msg.id);
      if (el) { el.innerHTML = msg.html; }
    }

    if (msg.action === 'remove-section') {
      var el = getSectionElement(msg.id);
      if (el) { el.remove(); }
    }

    if (msg.action === 'reorder-sections') {
      // msg.order = [id1, id2, id3, ...]
      var order = msg.order;
      for (var i = 0; i < order.length; i++) {
        var el = getSectionElement(order[i]);
        if (el) { document.body.appendChild(el); }
      }
    }

    if (msg.action === 'scroll-to-section') {
      var el = getSectionElement(msg.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }

    if (msg.action === 'full-rewrite') {
      // Fallback: rewrite everything
      document.body.innerHTML = msg.html;
    }
  });

  // Inject animation keyframe
  var style = document.createElement('style');
  style.textContent = '@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }';
  document.head.appendChild(style);

  // Notify parent we're ready
  window.parent.postMessage({ type: 'ready' }, '*');
})();
`;
}
