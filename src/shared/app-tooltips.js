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
  if (element?.classList?.contains("is-grade-low")) return "deficit";
  return "default";
}

function getExplicitPlacements(element) {
  const explicit = getAttributeText(element, "data-app-tooltip-placement");
  if (explicit) {
    const placements = explicit.split(/\s+/).filter((item) => (
      item === "right" || item === "left" || item === "below" || item === "above"
    ));
    if (placements.length) return placements;
  }
  return null;
}

function getPreferredPlacements(element) {
  const explicitPlacements = getExplicitPlacements(element);
  if (explicitPlacements) return explicitPlacements;
  if (element?.classList?.contains("grade-total-button")) {
    return ["right", "left", "below", "above"];
  }
  return ["below", "above", "right", "left"];
}

function getCornerPlacement(anchorRect, tooltipRect, viewportWidth, viewportHeight, margin, gap) {
  const candidates = [
    { placement: "right", corner: "bottom", left: anchorRect.right + gap, top: anchorRect.bottom - tooltipRect.height },
    { placement: "left", corner: "bottom", left: anchorRect.left - tooltipRect.width - gap, top: anchorRect.bottom - tooltipRect.height },
    { placement: "right", corner: "top", left: anchorRect.right + gap, top: anchorRect.top },
    { placement: "left", corner: "top", left: anchorRect.left - tooltipRect.width - gap, top: anchorRect.top }
  ];
  return candidates.find(({ left, top }) => (
    left >= margin
    && left + tooltipRect.width <= viewportWidth - margin
    && top >= margin
    && top + tooltipRect.height <= viewportHeight - margin
  )) || candidates[0];
}

function getVerticalPlacement(anchorRect, tooltipRect, viewportWidth, margin) {
  const rightAlignedLeft = anchorRect.right - tooltipRect.width;
  const leftAlignedLeft = anchorRect.left;
  const rightAlignedFits = rightAlignedLeft >= margin;
  const leftAlignedFits = leftAlignedLeft + tooltipRect.width <= viewportWidth - margin;

  if (rightAlignedFits) return { left: rightAlignedLeft, edge: "right" };
  if (leftAlignedFits) return { left: leftAlignedLeft, edge: "left" };
  const availableLeft = anchorRect.right - margin;
  const availableRight = viewportWidth - margin - anchorRect.left;
  return availableLeft >= availableRight
    ? { left: rightAlignedLeft, edge: "right" }
    : { left: leftAlignedLeft, edge: "left" };
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
  let activeSuppressedTitles = new Map();
  let activeAriaDescribedBy = null;
  let suppressTitleObserver = false;
  let rafId = 0;

  const portal = doc.createElement("div");
  portal.id = options.id || "app-tooltip-portal";
  portal.className = "app-tooltip-portal";
  portal.setAttribute("role", "tooltip");
  portal.setAttribute("aria-hidden", "true");
  const supportsPopover = typeof portal.showPopover === "function" && typeof portal.hidePopover === "function";
  if (supportsPopover) {
    portal.setAttribute("popover", "manual");
  }
  doc.body.append(portal);

  function releasePortalHost() {
    if (portal.parentElement !== doc.body) {
      doc.body.append(portal);
    }
    portal.style.left = "0px";
    portal.style.top = "0px";
    portal.style.removeProperty("--app-tooltip-arrow-x");
    portal.style.removeProperty("--app-tooltip-arrow-y");
  }

  function isPortalPopoverOpen() {
    if (!supportsPopover) return false;
    try {
      return portal.matches(":popover-open");
    } catch (error) {
      return false;
    }
  }

  function showPortalLayer() {
    if (!supportsPopover || isPortalPopoverOpen()) return;
    try {
      portal.showPopover();
    } catch (error) {
      // Keep the fixed body portal as a graceful fallback.
    }
  }

  function hidePortalLayer() {
    if (!supportsPopover || !isPortalPopoverOpen()) return;
    try {
      portal.hidePopover();
    } catch (error) {
      // The aria/class state below is still authoritative for hiding.
    }
  }

  function findAnchor(eventTarget) {
    const target = eventTarget instanceof ElementCtor ? eventTarget : null;
    const anchor = target?.closest?.(TOOLTIP_SELECTOR) || null;
    if (!(anchor instanceof HTMLElementCtor)) return null;
    if (anchor.matches(EXCLUDED_SELECTOR)) return null;
    if (anchor.closest("[data-app-tooltip-disabled='1']")) return null;
    if (!getTooltipText(anchor)) return null;
    return anchor;
  }

  function suppressNativeTitleElement(element, anchor) {
    if (!element?.hasAttribute?.("title")) return;
    const title = String(element.getAttribute("title") || "");
    activeSuppressedTitles.set(element, title);
    if (element === anchor) {
      activeNativeTitle = title;
    }
    element.removeAttribute("title");
  }

  function suppressNativeTitles(anchor) {
    activeNativeTitle = "";
    if (!(anchor instanceof HTMLElementCtor)) return;
    suppressTitleObserver = true;
    for (let element = anchor; element && element !== doc.body && element !== doc.documentElement; element = element.parentElement) {
      suppressNativeTitleElement(element, anchor);
    }
    suppressTitleObserver = false;
  }

  function restoreNativeTitles() {
    if (!activeSuppressedTitles.size) {
      activeNativeTitle = "";
      return;
    }
    suppressTitleObserver = true;
    for (const [element, title] of activeSuppressedTitles) {
      if (element?.isConnected && !element.hasAttribute("title")) {
        element.setAttribute("title", title);
      }
    }
    suppressTitleObserver = false;
    activeSuppressedTitles.clear();
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
      restoreNativeTitles();
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
    showPortalLayer();
    if (!isSameAnchor) {
      suppressNativeTitles(anchor);
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
    hidePortalLayer();
    restoreAriaDescription(previousAnchor);
    restoreNativeTitles();
    releasePortalHost();
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

    const explicitPlacements = getExplicitPlacements(anchor);
    const verticalPlacement = getVerticalPlacement(anchorRect, tooltipRect, viewportWidth, margin);
    const cornerPlacement = explicitPlacements
      ? null
      : getCornerPlacement(anchorRect, tooltipRect, viewportWidth, viewportHeight, margin, gap);
    const placements = getPreferredPlacements(anchor);
    const fits = {
      right: viewportWidth - anchorRect.right >= tooltipRect.width + gap + margin,
      left: anchorRect.left >= tooltipRect.width + gap + margin,
      below: viewportHeight - anchorRect.bottom >= tooltipRect.height + gap + margin,
      above: anchorRect.top >= tooltipRect.height + gap + margin
    };
    const placement = cornerPlacement?.placement || placements.find((item) => fits[item]) || placements[0] || "below";
    let left = cornerPlacement?.left ?? verticalPlacement.left;
    let top = cornerPlacement?.top ?? (anchorRect.bottom + gap);

    if (!cornerPlacement) {
      if (placement === "right") {
        left = anchorRect.right + gap;
        top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
      } else if (placement === "left") {
        left = anchorRect.left - tooltipRect.width - gap;
        top = anchorRect.top + (anchorRect.height / 2) - (tooltipRect.height / 2);
      } else if (placement === "above") {
        top = anchorRect.top - tooltipRect.height - gap;
      }
    }

    left = clamp(left, margin, Math.max(margin, viewportWidth - tooltipRect.width - margin));
    top = clamp(top, margin, Math.max(margin, viewportHeight - tooltipRect.height - margin));
    const arrowMargin = 10;
    const arrowX = placement === "below" || placement === "above"
      ? (verticalPlacement.edge === "right" ? tooltipRect.width - arrowMargin : arrowMargin)
      : clamp(
        anchorRect.left + (anchorRect.width / 2) - left,
        arrowMargin,
        Math.max(arrowMargin, tooltipRect.width - arrowMargin)
      );
    const arrowY = cornerPlacement
      ? (cornerPlacement.corner === "bottom" ? tooltipRect.height - arrowMargin : arrowMargin)
      : clamp(
        anchorRect.top + (anchorRect.height / 2) - top,
        arrowMargin,
        Math.max(arrowMargin, tooltipRect.height - arrowMargin)
      );
    portal.dataset.placement = placement;
    portal.style.setProperty("--app-tooltip-arrow-x", `${Math.round(arrowX)}px`);
    portal.style.setProperty("--app-tooltip-arrow-y", `${Math.round(arrowY)}px`);
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

  function handleContextMenu() {
    // Tooltips can use the browser's top layer via the Popover API, which
    // would otherwise render above an app-owned context menu regardless of z-index.
    hideTooltip();
  }

  function handleMutation(mutations) {
    if (!activeAnchor || suppressTitleObserver) return;
    for (const mutation of mutations) {
      if (mutation.target !== activeAnchor) continue;
      if (mutation.attributeName === "title" && activeAnchor.hasAttribute("title")) {
        activeNativeTitle = String(activeAnchor.getAttribute("title") || "");
        suppressNativeTitles(activeAnchor);
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
  doc.addEventListener("contextmenu", handleContextMenu, true);
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
      doc.removeEventListener("contextmenu", handleContextMenu, true);
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
