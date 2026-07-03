const TOOLTIP_SELECTOR = "[data-app-tooltip], [data-grade-tooltip], [data-tooltip], [title]";
const EXCLUDED_SELECTOR = [
  "html",
  "head",
  "body",
  "title",
  "meta",
  "link",
  "style",
  "script",
  "template",
  "iframe",
  "[data-app-tooltip-disabled='1']"
].join(",");

function getElementConstructor(doc) {
  return doc?.defaultView?.Element || globalThis.Element;
}

function getHTMLElementConstructor(doc) {
  return doc?.defaultView?.HTMLElement || globalThis.HTMLElement;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getAttributeText(element, name) {
  return element?.hasAttribute?.(name) ? normalizeText(element.getAttribute(name)) : "";
}

function getTooltipText(element, activeTitle = "") {
  if (!element) return "";
  return getAttributeText(element, "data-app-tooltip")
    || getAttributeText(element, "data-grade-tooltip")
    || getAttributeText(element, "data-tooltip")
    || normalizeText(activeTitle)
    || getAttributeText(element, "title");
}

function getTooltipTone(element) {
  const explicitTone = getAttributeText(element, "data-app-tooltip-tone");
  if (explicitTone) return explicitTone;
  if (element?.classList?.contains("is-grade-near-better")) return "near-better";
  return "default";
}

function getPreferredPlacements(element) {
  const explicit = getAttributeText(element, "data-app-tooltip-placement");
  if (explicit) {
    const placements = explicit.split(/\s+/).filter((item) => (
      item === "right" || item === "left" || item === "below" || item === "above"
    ));
    if (placements.length) return placements;
  }
  if (element?.classList?.contains("grade-total-button")) {
    return ["right", "left", "below", "above"];
  }
  return ["below", "above", "right", "left"];
}

export function installAppTooltips(root = document, options = {}) {
  const doc = root?.nodeType === 9 ? root : (root?.ownerDocument || document);
  const ElementCtor = getElementConstructor(doc);
  const HTMLElementCtor = getHTMLElementConstructor(doc);
  if (!doc?.body || !ElementCtor || !HTMLElementCtor || doc.__teachhelperAppTooltipsInstalled) {
    return doc?.__teachhelperAppTooltipsController || null;
  }

  let activeAnchor = null;
  let activeNativeTitle = "";
  let activeAriaDescribedBy = null;
  let suppressTitleObserver = false;
  let rafId = 0;

  const portal = doc.createElement("div");
  portal.id = options.id || "app-tooltip-portal";
  portal.className = "app-tooltip-portal";
  portal.setAttribute("role", "tooltip");
  portal.setAttribute("aria-hidden", "true");
  doc.body.append(portal);

  function findAnchor(eventTarget) {
    const target = eventTarget instanceof ElementCtor ? eventTarget : null;
    const anchor = target?.closest?.(TOOLTIP_SELECTOR) || null;
    if (!(anchor instanceof HTMLElementCtor)) return null;
    if (anchor.matches(EXCLUDED_SELECTOR)) return null;
    if (anchor.closest("[data-app-tooltip-disabled='1']")) return null;
    if (!getTooltipText(anchor)) return null;
    return anchor;
  }

  function suppressNativeTitle(anchor) {
    activeNativeTitle = "";
    if (!anchor?.hasAttribute?.("title")) return;
    activeNativeTitle = String(anchor.getAttribute("title") || "");
    suppressTitleObserver = true;
    anchor.removeAttribute("title");
    suppressTitleObserver = false;
  }

  function restoreNativeTitle(anchor = activeAnchor) {
    if (!anchor || !activeNativeTitle) return;
    if (!anchor.hasAttribute("title")) {
      suppressTitleObserver = true;
      anchor.setAttribute("title", activeNativeTitle);
      suppressTitleObserver = false;
    }
    activeNativeTitle = "";
  }

  function syncAriaDescription(anchor) {
    if (!anchor) return;
    activeAriaDescribedBy = anchor.getAttribute("aria-describedby");
    const ids = String(activeAriaDescribedBy || "").split(/\s+/).filter(Boolean);
    if (!ids.includes(portal.id)) {
      ids.push(portal.id);
      anchor.setAttribute("aria-describedby", ids.join(" "));
    }
  }

  function restoreAriaDescription(anchor = activeAnchor) {
    if (!anchor || activeAriaDescribedBy === null) return;
    if (activeAriaDescribedBy) {
      anchor.setAttribute("aria-describedby", activeAriaDescribedBy);
    } else {
      anchor.removeAttribute("aria-describedby");
    }
    activeAriaDescribedBy = null;
  }

  function schedulePosition() {
    if (rafId) return;
    rafId = doc.defaultView.requestAnimationFrame(() => {
      rafId = 0;
      positionTooltip();
    });
  }

  function showTooltip(anchor) {
    if (!(anchor instanceof HTMLElementCtor) || !anchor.isConnected) return;
    const isSameAnchor = activeAnchor === anchor;
    if (activeAnchor && activeAnchor !== anchor) {
      restoreAriaDescription(activeAnchor);
      restoreNativeTitle(activeAnchor);
    }
    activeAnchor = anchor;
    const text = getTooltipText(anchor, isSameAnchor ? activeNativeTitle : "");
    if (!text) {
      hideTooltip(anchor);
      return;
    }
    portal.textContent = text;
    portal.dataset.tone = getTooltipTone(anchor);
    portal.setAttribute("aria-hidden", "false");
    portal.classList.add("is-visible");
    if (!isSameAnchor) {
      suppressNativeTitle(anchor);
      syncAriaDescription(anchor);
    }
    schedulePosition();
  }

  function hideTooltip(anchor = null) {
    if (anchor && activeAnchor && anchor !== activeAnchor) return;
    const previousAnchor = activeAnchor;
    activeAnchor = null;
    portal.classList.remove("is-visible");
    portal.setAttribute("aria-hidden", "true");
    delete portal.dataset.placement;
    restoreAriaDescription(previousAnchor);
    restoreNativeTitle(previousAnchor);
  }

  function positionTooltip() {
    const anchor = activeAnchor;
    if (!portal || !(anchor instanceof HTMLElementCtor) || !anchor.isConnected) {
      hideTooltip();
      return;
    }
    const text = getTooltipText(anchor, activeNativeTitle);
    if (!text) {
      hideTooltip(anchor);
      return;
    }
    const margin = Number(options.margin || 8);
    const gap = Number(options.gap || 10);
    portal.style.left = "0px";
    portal.style.top = "0px";
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = portal.getBoundingClientRect();
    const viewportWidth = doc.defaultView.innerWidth || doc.documentElement.clientWidth || 0;
    const viewportHeight = doc.defaultView.innerHeight || doc.documentElement.clientHeight || 0;
    if (anchorRect.width <= 0 || anchorRect.height <= 0 || tooltipRect.width <= 0 || tooltipRect.height <= 0) {
      hideTooltip(anchor);
      return;
    }

    const placements = getPreferredPlacements(anchor);
    const fits = {
      right: viewportWidth - anchorRect.right >= tooltipRect.width + gap + margin,
      left: anchorRect.left >= tooltipRect.width + gap + margin,
      below: viewportHeight - anchorRect.bottom >= tooltipRect.height + gap + margin,
      above: anchorRect.top >= tooltipRect.height + gap + margin
    };
    const placement = placements.find((item) => fits[item]) || placements[0] || "below";
    let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);
    let top = anchorRect.bottom + gap;

    if (placement === "right") {
      left = anchorRect.right + gap;
      top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
    } else if (placement === "left") {
      left = anchorRect.left - tooltipRect.width - gap;
      top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
    } else if (placement === "above") {
      top = anchorRect.top - tooltipRect.height - gap;
    }

    left = clamp(left, margin, Math.max(margin, viewportWidth - tooltipRect.width - margin));
    top = clamp(top, margin, Math.max(margin, viewportHeight - tooltipRect.height - margin));
    portal.dataset.placement = placement;
    portal.style.left = `${Math.round(left)}px`;
    portal.style.top = `${Math.round(top)}px`;
  }

  function refreshActiveTooltip() {
    if (!activeAnchor) return;
    const text = getTooltipText(activeAnchor, activeNativeTitle);
    if (!text) {
      hideTooltip(activeAnchor);
      return;
    }
    portal.textContent = text;
    portal.dataset.tone = getTooltipTone(activeAnchor);
    schedulePosition();
  }

  function handlePointerOver(event) {
    const anchor = findAnchor(event.target);
    if (anchor) showTooltip(anchor);
  }

  function handlePointerOut(event) {
    let anchor = findAnchor(event.target);
    if (!anchor && activeAnchor && event.target instanceof ElementCtor && activeAnchor.contains(event.target)) {
      anchor = activeAnchor;
    }
    if (!anchor) return;
    const related = event.relatedTarget instanceof ElementCtor ? event.relatedTarget : null;
    if (related && anchor.contains(related)) return;
    hideTooltip(anchor);
  }

  function handleFocusIn(event) {
    const anchor = findAnchor(event.target);
    if (anchor) showTooltip(anchor);
  }

  function handleFocusOut(event) {
    let anchor = findAnchor(event.target);
    if (!anchor && activeAnchor && event.target instanceof ElementCtor && activeAnchor.contains(event.target)) {
      anchor = activeAnchor;
    }
    if (!anchor) return;
    const related = event.relatedTarget instanceof ElementCtor ? event.relatedTarget : null;
    if (related && anchor.contains(related)) return;
    hideTooltip(anchor);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && activeAnchor) {
      hideTooltip();
    }
  }

  function handleMutation(mutations) {
    if (!activeAnchor || suppressTitleObserver) return;
    for (const mutation of mutations) {
      if (mutation.target !== activeAnchor) continue;
      if (mutation.attributeName === "title" && activeAnchor.hasAttribute("title")) {
        activeNativeTitle = String(activeAnchor.getAttribute("title") || "");
        suppressNativeTitle(activeAnchor);
      }
      refreshActiveTooltip();
      return;
    }
  }

  const observer = new MutationObserver(handleMutation);
  observer.observe(doc.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "data-app-tooltip", "data-grade-tooltip", "data-tooltip", "data-app-tooltip-tone", "class"]
  });

  doc.addEventListener("pointerover", handlePointerOver);
  doc.addEventListener("pointerout", handlePointerOut);
  doc.addEventListener("focusin", handleFocusIn);
  doc.addEventListener("focusout", handleFocusOut);
  doc.addEventListener("keydown", handleKeyDown);
  doc.defaultView.addEventListener("scroll", schedulePosition, true);
  doc.defaultView.addEventListener("resize", schedulePosition);

  const controller = {
    hide: () => hideTooltip(),
    refresh: refreshActiveTooltip,
    dispose() {
      hideTooltip();
      observer.disconnect();
      doc.removeEventListener("pointerover", handlePointerOver);
      doc.removeEventListener("pointerout", handlePointerOut);
      doc.removeEventListener("focusin", handleFocusIn);
      doc.removeEventListener("focusout", handleFocusOut);
      doc.removeEventListener("keydown", handleKeyDown);
      doc.defaultView.removeEventListener("scroll", schedulePosition, true);
      doc.defaultView.removeEventListener("resize", schedulePosition);
      if (rafId) {
        doc.defaultView.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      portal.remove();
      doc.__teachhelperAppTooltipsInstalled = false;
      doc.__teachhelperAppTooltipsController = null;
    }
  };

  doc.__teachhelperAppTooltipsInstalled = true;
  doc.__teachhelperAppTooltipsController = controller;
  return controller;
}
