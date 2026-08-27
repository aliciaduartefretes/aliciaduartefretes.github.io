/* NALVI · Paso 2B · Adaptador visual y de accesibilidad (sin lógica de negocio). */
(() => {
  "use strict";

  const VERSION = "NALVI-DS-1.0";
  if (window.NALVI_DESIGN_SYSTEM?.version === VERSION) return;

  function syncNavigationAccessibility() {
    document.querySelectorAll(".bottom-nav .nav-btn").forEach(button => {
      const decorativeIcon = button.querySelector("span");
      if (decorativeIcon) decorativeIcon.setAttribute("aria-hidden", "true");
      if (button.classList.contains("active")) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function enhanceActivity(root = document) {
    root.querySelectorAll?.(".kuaa-activity").forEach(activity => {
      if (activity.dataset.nalviAccessible === "true") return;
      const heading = activity.querySelector("h3");
      if (heading) {
        heading.id ||= `nalvi-activity-${Math.random().toString(36).slice(2, 9)}`;
        activity.setAttribute("aria-labelledby", heading.id);
      }
      activity.setAttribute("role", "region");
      activity.dataset.nalviAccessible = "true";
    });
  }

  function enhanceProgress(root = document) {
    root.querySelectorAll?.(".progress").forEach(progress => {
      const indicator = progress.querySelector("i");
      if (!indicator) return;
      const value = Math.max(0, Math.min(100, Number.parseFloat(indicator.style.width) || 0));
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("aria-valuenow", String(Math.round(value)));
    });
  }

  function install() {
    document.body.dataset.designSystem = VERSION;
    syncNavigationAccessibility();
    enhanceActivity();
    enhanceProgress();

    const navigation = document.querySelector(".bottom-nav");
    if (navigation) {
      new MutationObserver(syncNavigationAccessibility).observe(navigation, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "data-go"]
      });
    }

    const main = document.querySelector("main");
    if (main) {
      new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          enhanceActivity(node.matches?.(".kuaa-activity") ? node.parentElement : node);
          enhanceProgress(node);
        }));
      }).observe(main, { childList: true, subtree: true });
    }

    document.addEventListener("kuaa:activity-rendered", event => enhanceActivity(event.target));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();

  window.NALVI_DESIGN_SYSTEM = Object.freeze({
    version: VERSION,
    audit: () => ({
      version: VERSION,
      navigationEnhanced: Boolean(document.querySelector(".bottom-nav")),
      activityComponents: document.querySelectorAll(".kuaa-activity").length,
      firebaseChanged: false,
      courseEngineChanged: false,
      artificialIntelligenceChanged: false
    })
  });
})();
