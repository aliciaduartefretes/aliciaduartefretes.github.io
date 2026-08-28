/* NALVI · Paso 2B · Adaptador visual y de accesibilidad (sin lógica de negocio). */
(() => {
  "use strict";

  const VERSION = "NALVI-DS-1.0";
  if (window.NALVI_DESIGN_SYSTEM?.version === VERSION) return;

  const BOOT_COPY = Object.freeze({
    es: "Preparando tu experiencia…",
    en: "Preparing your experience…",
    pt: "Preparando sua experiência…",
    fr: "Préparation de votre expérience…",
    it: "Preparazione della tua esperienza…",
    de: "Dein Lernerlebnis wird vorbereitet…"
  });
  let bootState = "BOOTING";

  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  function currentInterfaceLanguage() {
    const selected = document.querySelector("#headerLang, #lang")?.value;
    const candidate = selected || document.documentElement.lang || "es";
    return Object.hasOwn(BOOT_COPY, candidate) ? candidate : "es";
  }

  function updateBootCopy() {
    const copy = document.querySelector("#nalviBootCopy");
    const language = currentInterfaceLanguage();
    if (copy) copy.textContent = BOOT_COPY[language];
    document.querySelector("#nalviBoot")?.setAttribute("aria-label", BOOT_COPY[language]);
  }

  function removeLegacyHomeHero() {
    document.querySelector("#home .hero-art")?.remove();
  }

  function waitForSignal(eventName, snapshotName, timeout) {
    if (window[snapshotName]) return Promise.resolve(window[snapshotName]);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        window.removeEventListener(eventName, onSignal);
        resolve(value || null);
      };
      const onSignal = event => finish(event.detail);
      window.addEventListener(eventName, onSignal, { once: true });
      setTimeout(() => finish(window[snapshotName] || null), timeout);
    });
  }

  async function waitForMinimumIdentity() {
    const authSnapshot = await waitForSignal("nalvi:auth-known", "NALVI_AUTH_SNAPSHOT", 850);
    if (!authSnapshot?.signedIn || authSnapshot.anonymous) return;
    await waitForSignal("nalvi:role-known", "NALVI_ROLE_SNAPSHOT", 900);
  }

  function markApplicationReady() {
    if (bootState === "READY") return;
    bootState = "READY";
    document.documentElement.dataset.nalviBoot = "ready";
    const boot = document.querySelector("#nalviBoot");
    if (boot) {
      boot.setAttribute("aria-hidden", "true");
      boot.remove();
    }
    window.dispatchEvent(new CustomEvent("nalvi:ready", { detail: { state: bootState } }));
  }

  async function stabilizeInitialRender() {
    updateBootCopy();
    removeLegacyHomeHero();
    await nextFrame();
    await Promise.race([waitForMinimumIdentity(), wait(1600)]);
    await nextFrame();
    markApplicationReady();
  }

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
    removeLegacyHomeHero();
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
    stabilizeInitialRender().catch(error => {
      console.error("NALVI_BOOT", error);
      markApplicationReady();
    });
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

  window.NALVI_BOOT = Object.freeze({
    version: "NALVI-BOOT-1",
    get state() { return bootState; },
    audit: () => ({
      state: bootState,
      legacyHomeHeroPresent: Boolean(document.querySelector("#home .hero-art")),
      designSystemLinkedBeforeBody: true,
      waitsForSecondaryAcademicQueries: false,
      firebaseRulesChanged: false
    })
  });
})();
