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
  const SHADOW_HOVER = 'inset 0 0 0 2px #3B82F6';
  const SHADOW_SELECTED = 'inset 0 0 0 2px #8B5CF6';

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

  function getCleanSectionHtml(sectionEl) {
    var els = sectionEl.querySelectorAll('*');
    var saved = [];
    for (var i = 0; i < els.length; i++) {
      var s = els[i].style;
      saved.push({ boxShadow: s.boxShadow, ce: els[i].contentEditable });
      s.boxShadow = '';
      if (els[i].contentEditable === 'true') els[i].removeAttribute('contenteditable');
    }
    // Also clean the section root
    var rootShadow = sectionEl.style.boxShadow;
    sectionEl.style.boxShadow = '';
    var html = sectionEl.innerHTML;
    sectionEl.style.boxShadow = rootShadow;
    for (var i = 0; i < els.length; i++) {
      els[i].style.boxShadow = saved[i].boxShadow;
      if (saved[i].ce === 'true') els[i].contentEditable = 'true';
    }
    return html;
  }

  function isTextElement(el) {
    var textTags = ['H1','H2','H3','H4','H5','H6','P','SPAN','LI','A','BLOCKQUOTE','LABEL','TD','TH','FIGCAPTION','BUTTON'];
    return textTags.indexOf(el.tagName) !== -1;
  }

  function emitElementSelected(el) {
    var rect = el.getBoundingClientRect();
    var attrs = {};
    if (el.tagName === 'IMG') attrs = { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' };
    if (el.tagName === 'A') attrs = { href: el.getAttribute('href') || '', target: el.getAttribute('target') || '' };
    var ot = el.outerHTML.split('>')[0] + '>';
    if (ot.length > 200) ot = ot.substring(0, 200);
    window.parent.postMessage({
      type: 'element-selected',
      sectionId: getSectionId(el),
      tagName: el.tagName,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      text: (el.textContent || '').substring(0, 200),
      openTag: ot,
      elementPath: getElementPath(el),
      isSectionRoot: el.dataset && el.dataset.sectionId ? true : false,
      attrs: attrs,
      className: (typeof el.className === 'string' ? el.className : '') || '',
    }, '*');
  }

  // Hover
  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    while (el && el !== document.body && (el instanceof SVGElement) && el.tagName !== 'svg') {
      el = el.parentElement;
    }
    if (el && el.tagName === 'svg' && el.parentElement) el = el.parentElement;
    if (el === document.body || el === document.documentElement) return;
    if (el === selectedEl) return;
    if (hoveredEl && hoveredEl !== selectedEl) {
      hoveredEl.style.boxShadow = '';
    }
    hoveredEl = el;
    if (el !== selectedEl) {
      el.style.boxShadow = SHADOW_HOVER;
    }
  });

  document.addEventListener('mouseout', function(e) {
    if (hoveredEl && hoveredEl !== selectedEl) {
      hoveredEl.style.boxShadow = '';
    }
    hoveredEl = null;
  });

  // Click — select element
  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;

    // Bubble up from SVG internals to the nearest HTML element
    while (el && el !== document.body && (el instanceof SVGElement) && el.tagName !== 'svg') {
      el = el.parentElement;
    }
    // If we landed on an <svg>, bubble up to its HTML parent
    if (el && el.tagName === 'svg' && el.parentElement) {
      el = el.parentElement;
    }

    // Deselect previous
    if (selectedEl) {
      selectedEl.style.boxShadow = '';
    }

    if (selectedEl === el) {
      selectedEl = null;
      window.parent.postMessage({ type: 'element-deselected' }, '*');
      return;
    }

    selectedEl = el;

    // Clear hover styles BEFORE capturing openTag (so it matches source HTML)
    el.style.boxShadow = '';
    var openTag = el.outerHTML.substring(0, el.outerHTML.indexOf('>') + 1).substring(0, 120);

    el.style.boxShadow = SHADOW_SELECTED;

    var rect = el.getBoundingClientRect();
    var attrs = {};
    if (el.tagName === 'IMG') {
      attrs = { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' };
    }
    if (el.tagName === 'A') {
      attrs = { href: el.getAttribute('href') || '', target: el.getAttribute('target') || '' };
    }

    window.parent.postMessage({
      type: 'element-selected',
      sectionId: getSectionId(el),
      tagName: el.tagName,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      text: (el.textContent || '').substring(0, 200),
      openTag: openTag,
      elementPath: getElementPath(el),
      isSectionRoot: el.dataset && el.dataset.sectionId ? true : false,
      attrs: attrs,
      className: el.className || '',
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
    el.style.boxShadow = 'inset 0 0 0 2px #F59E0B';

    function onBlur() {
      el.contentEditable = 'false';
      el.style.boxShadow = '';
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKeydown);

      var sid = getSectionId(el);
      var sectionEl = sid ? getSectionElement(sid) : null;
      window.parent.postMessage({
        type: 'text-edited',
        sectionId: sid,
        elementPath: getElementPath(el),
        newText: el.innerHTML,
        sectionHtml: sectionEl ? getCleanSectionHtml(sectionEl) : null,
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
      if (msg.scroll) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }

    if (msg.action === 'update-section') {
      var el = getSectionElement(msg.id);
      if (el && typeof window.morphdom === 'function') {
        var tmp = document.createElement('div');
        tmp.innerHTML = msg.html;
        window.morphdom(el, tmp, {
          childrenOnly: true,
          onBeforeElUpdated: function(fromEl, toEl) {
            if (fromEl.isEqualNode(toEl)) return false;
            return true;
          }
        });
      } else if (el) {
        el.innerHTML = msg.html;
      }
    }

    if (msg.action === 'rename-section') {
      var el = getSectionElement(msg.oldId);
      if (el) {
        el.setAttribute('data-section-id', msg.newId);
        if (msg.html) {
          if (typeof window.morphdom === 'function') {
            var tmp = document.createElement('div');
            tmp.innerHTML = msg.html;
            window.morphdom(el, tmp, { childrenOnly: true, onBeforeElUpdated: function(f,t){ return !f.isEqualNode(t); } });
          } else {
            el.innerHTML = msg.html;
          }
        }
      }
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

    if (msg.action === 'update-attribute') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl) {
        var target = null;
        if (msg.elementPath) {
          // Find element by matching path
          var allEls = sectionEl.querySelectorAll(msg.tagName || '*');
          for (var i = 0; i < allEls.length; i++) {
            if (getElementPath(allEls[i]) === msg.elementPath) {
              target = allEls[i];
              break;
            }
          }
        }
        if (target) {
          if (msg.attr === 'style' && msg.value.indexOf(':') !== -1) {
            // Merge style property instead of replacing entire style
            var parts = msg.value.split(':');
            var prop = parts[0].trim();
            var val = parts.slice(1).join(':').trim();
            target.style.setProperty(prop, val);
          } else {
            target.setAttribute(msg.attr, msg.value);
          }
          window.parent.postMessage({
            type: 'section-html-updated',
            sectionId: msg.sectionId,
            sectionHtml: getCleanSectionHtml(sectionEl),
          }, '*');
          emitElementSelected(target);
        }
      }
    }

    if (msg.action === 'replace-class') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl && msg.elementPath) {
        var target = null;
        var allEls = sectionEl.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          if (getElementPath(allEls[i]) === msg.elementPath) {
            target = allEls[i];
            break;
          }
        }
        if (target) {
          // Remove classes matching prefixes (supports responsive variants like md:p-4)
          var prefixes = msg.removePrefixes || [];
          var toRemove = [];
          for (var ci = 0; ci < target.classList.length; ci++) {
            var cls = target.classList[ci];
            var bare = cls.indexOf(':') !== -1 ? cls.substring(cls.lastIndexOf(':') + 1) : cls;
            for (var pi = 0; pi < prefixes.length; pi++) {
              if (bare === prefixes[pi] || bare.indexOf(prefixes[pi]) === 0) {
                toRemove.push(cls);
                break;
              }
            }
          }
          for (var ri = 0; ri < toRemove.length; ri++) {
            target.classList.remove(toRemove[ri]);
          }
          // Add new class
          if (msg.addClass && !target.classList.contains(msg.addClass)) {
            target.classList.add(msg.addClass);
          }
          window.parent.postMessage({
            type: 'section-html-updated',
            sectionId: msg.sectionId,
            sectionHtml: getCleanSectionHtml(sectionEl),
          }, '*');
          emitElementSelected(target);
        }
      }
    }

    if (msg.action === 'delete-element') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl && msg.elementPath) {
        var target = null;
        var allEls = sectionEl.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          if (getElementPath(allEls[i]) === msg.elementPath) {
            target = allEls[i];
            break;
          }
        }
        if (target && target.parentNode) {
          target.parentNode.removeChild(target);
          window.parent.postMessage({
            type: 'section-html-updated',
            sectionId: msg.sectionId,
            sectionHtml: getCleanSectionHtml(sectionEl),
          }, '*');
          window.parent.postMessage({ type: 'element-deselected' }, '*');
        }
      }
    }

    if (msg.action === 'change-tag') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl && msg.elementPath && msg.newTag) {
        var target = null;
        var allEls = sectionEl.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          if (getElementPath(allEls[i]) === msg.elementPath) {
            target = allEls[i];
            break;
          }
        }
        if (target && target.parentNode) {
          var newEl = document.createElement(msg.newTag);
          for (var a = 0; a < target.attributes.length; a++) {
            newEl.setAttribute(target.attributes[a].name, target.attributes[a].value);
          }
          while (target.firstChild) newEl.appendChild(target.firstChild);
          target.parentNode.replaceChild(newEl, target);
          window.parent.postMessage({
            type: 'section-html-updated',
            sectionId: msg.sectionId,
            sectionHtml: getCleanSectionHtml(sectionEl),
          }, '*');
          emitElementSelected(newEl);
        }
      }
    }

    if (msg.action === 'set-theme') {
      if (msg.theme && msg.theme !== 'default') {
        document.documentElement.setAttribute('data-theme', msg.theme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }

    if (msg.action === 'set-custom-css') {
      var customStyle = document.getElementById('custom-theme-css');
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.id = 'custom-theme-css';
        document.head.appendChild(customStyle);
      }
      customStyle.textContent = msg.css || '';
    }

    if (msg.action === 'scroll-to-section') {
      var el = getSectionElement(msg.id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }

    if (msg.action === 'get-scroll') {
      window.parent.postMessage({ type: 'scroll-position', y: window.scrollY }, '*');
    }

    if (msg.action === 'restore-scroll') {
      window.scrollTo(0, msg.y);
    }

    if (msg.action === 'element-loading') {
      var sectionEl = getSectionElement(msg.sectionId);
      if (sectionEl && msg.elementPath) {
        var allEls = sectionEl.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          if (getElementPath(allEls[i]) === msg.elementPath) {
            var el = allEls[i];
            el.style.position = 'relative';
            el.style.overflow = 'hidden';
            var overlay = document.createElement('div');
            overlay.setAttribute('data-loading-overlay', 'true');
            overlay.style.cssText = 'position:absolute;inset:0;z-index:999;border-radius:inherit;background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.6) 50%,rgba(255,255,255,0) 100%);background-size:200% 100%;animation:shimmer 1.5s infinite;pointer-events:none;';
            el.appendChild(overlay);
            break;
          }
        }
      }
    }

    if (msg.action === 'element-loading-clear') {
      var overlays = document.querySelectorAll('[data-loading-overlay]');
      for (var i = 0; i < overlays.length; i++) {
        overlays[i].remove();
      }
    }

    if (msg.action === 'full-rewrite') {
      // Fallback: rewrite everything
      document.body.innerHTML = msg.html;
    }
  });

  // Forward Cmd/Ctrl+Z undo/redo to parent (iframe captures keyboard focus)
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      window.parent.postMessage({ type: e.shiftKey ? 'redo' : 'undo' }, '*');
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      window.parent.postMessage({ type: 'redo' }, '*');
    }
  });

  // Image loading placeholders
  function setupImagePlaceholder(img) {
    if (img.complete && img.naturalWidth > 0) return;
    img.style.background = 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)';
    img.style.backgroundSize = '200% 100%';
    img.style.animation = 'shimmer 1.5s infinite';
    if (!img.style.minHeight && !img.getAttribute('height')) img.style.minHeight = '120px';
    function onDone() {
      img.style.background = '';
      img.style.backgroundSize = '';
      img.style.animation = '';
      if (img.style.minHeight === '120px') img.style.minHeight = '';
      img.removeEventListener('load', onDone);
      img.removeEventListener('error', onDone);
    }
    img.addEventListener('load', onDone);
    img.addEventListener('error', onDone);
  }
  // Observe new/changed images
  var imgObserver = new MutationObserver(function(mutations) {
    for (var m = 0; m < mutations.length; m++) {
      // New nodes
      for (var n = 0; n < mutations[m].addedNodes.length; n++) {
        var node = mutations[m].addedNodes[n];
        if (node.tagName === 'IMG') setupImagePlaceholder(node);
        if (node.querySelectorAll) {
          var imgs = node.querySelectorAll('img');
          for (var i = 0; i < imgs.length; i++) setupImagePlaceholder(imgs[i]);
        }
      }
      // src attribute changed
      if (mutations[m].type === 'attributes' && mutations[m].attributeName === 'src' && mutations[m].target.tagName === 'IMG') {
        setupImagePlaceholder(mutations[m].target);
      }
    }
  });
  imgObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  // Initial images
  var existingImgs = document.querySelectorAll('img');
  for (var ii = 0; ii < existingImgs.length; ii++) setupImagePlaceholder(existingImgs[ii]);

  // Inject animation keyframes
  var style = document.createElement('style');
  style.textContent = '@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } } @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }';
  document.head.appendChild(style);

  // Notify parent we're ready
  window.parent.postMessage({ type: 'ready' }, '*');
})();
`;
}
