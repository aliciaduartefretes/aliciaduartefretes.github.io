/* NALVI · Paso 2B · Adaptador visual y de accesibilidad (sin lógica de negocio). */
(() => {
  "use strict";

  const VERSION = "NALVI-DS-1.2-PUBLIC-COPY";
  if (window.NALVI_DESIGN_SYSTEM?.version === VERSION) return;

  const BOOT_COPY = Object.freeze({
    es: "Preparando tu experiencia…",
    en: "Preparing your experience…",
    pt: "Preparando sua experiência…",
    fr: "Préparation de votre expérience…",
    it: "Preparazione della tua esperienza…",
    de: "Dein Lernerlebnis wird vorbereitet…"
  });
  const DICTIONARY_COPY = Object.freeze({
    es: {
      tag: "📚 DICCIONARIO GUARANÍ–ESPAÑOL",
      title: "Busca, comprende y escucha",
      intro: "Busca palabras en guaraní o español y escucha las pronunciaciones disponibles.",
      search: "Buscar en guaraní o español…",
      counter: "{total} palabras y expresiones · {matches} {result}",
      resultOne: "resultado",
      resultMany: "resultados",
      empty: "No encontramos esa palabra. Prueba otra escritura.",
      fallback: "Entrada disponible para consulta y práctica.",
      more: "Mostrar más palabras ({remaining} restantes)",
      listen: "Escuchar"
    },
    en: {
      tag: "📚 GUARANÍ–SPANISH DICTIONARY",
      title: "Search, understand and listen",
      intro: "Search for words in Guaraní or Spanish and listen to available pronunciations.",
      search: "Search in Guaraní or Spanish…",
      counter: "{total} words and expressions · {matches} {result}",
      resultOne: "result",
      resultMany: "results",
      empty: "We could not find that word. Try another spelling.",
      fallback: "Entry available for reference and practice.",
      more: "Show more words ({remaining} remaining)",
      listen: "Listen to"
    },
    pt: {
      tag: "📚 DICIONÁRIO GUARANI–ESPANHOL",
      title: "Busque, compreenda e escute",
      intro: "Busque palavras em guarani ou espanhol e ouça as pronúncias disponíveis.",
      search: "Buscar em guarani ou espanhol…",
      counter: "{total} palavras e expressões · {matches} {result}",
      resultOne: "resultado",
      resultMany: "resultados",
      empty: "Não encontramos essa palavra. Tente outra grafia.",
      fallback: "Entrada disponível para consulta e prática.",
      more: "Mostrar mais palavras ({remaining} restantes)",
      listen: "Ouvir"
    },
    fr: {
      tag: "📚 DICTIONNAIRE GUARANI–ESPAGNOL",
      title: "Recherchez, comprenez et écoutez",
      intro: "Recherchez des mots en guarani ou en espagnol et écoutez les prononciations disponibles.",
      search: "Rechercher en guarani ou en espagnol…",
      counter: "{total} mots et expressions · {matches} {result}",
      resultOne: "résultat",
      resultMany: "résultats",
      empty: "Ce mot est introuvable. Essayez une autre orthographe.",
      fallback: "Entrée disponible pour la consultation et la pratique.",
      more: "Afficher plus de mots ({remaining} restants)",
      listen: "Écouter"
    },
    it: {
      tag: "📚 DIZIONARIO GUARANÍ–SPAGNOLO",
      title: "Cerca, comprendi e ascolta",
      intro: "Cerca parole in guaraní o in spagnolo e ascolta le pronunce disponibili.",
      search: "Cerca in guaraní o in spagnolo…",
      counter: "{total} parole ed espressioni · {matches} {result}",
      resultOne: "risultato",
      resultMany: "risultati",
      empty: "Non abbiamo trovato questa parola. Prova un'altra grafia.",
      fallback: "Voce disponibile per consultazione e pratica.",
      more: "Mostra altre parole ({remaining} rimanenti)",
      listen: "Ascolta"
    },
    de: {
      tag: "📚 GUARANÍ–SPANISCHES WÖRTERBUCH",
      title: "Suchen, verstehen und anhören",
      intro: "Suche Wörter auf Guaraní oder Spanisch und höre verfügbare Aussprachen an.",
      search: "Auf Guaraní oder Spanisch suchen…",
      counter: "{total} Wörter und Ausdrücke · {matches} {result}",
      resultOne: "Ergebnis",
      resultMany: "Ergebnisse",
      empty: "Dieses Wort wurde nicht gefunden. Versuche eine andere Schreibweise.",
      fallback: "Eintrag zum Nachschlagen und Üben verfügbar.",
      more: "Weitere Wörter anzeigen ({remaining} verbleibend)",
      listen: "Anhören"
    }
  });
  const DICTIONARY_FALLBACKS = new Set(Object.values(DICTIONARY_COPY).map(copy => copy.fallback));
  const DICTIONARY_EMPTY_STATES = new Set(Object.values(DICTIONARY_COPY).map(copy => copy.empty));
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

  function removeLegacyAcademicPromotion(root = document) {
    root.querySelectorAll?.("#course .insta-cta, #videos .insta-cta, .follow-label").forEach(node => node.remove());
  }

  function removePublicDictionarySources(root = document) {
    root.querySelectorAll?.("#dictionary .dictionary-source").forEach(node => node.remove());
  }

  function stabilizePublicSurface(root = document) {
    removeLegacyAcademicPromotion(root);
    removePublicDictionarySources(root);
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function localizePublicDictionary() {
    const dictionary = document.querySelector("#dictionary");
    if (!dictionary) return;
    const copy = DICTIONARY_COPY[currentInterfaceLanguage()] || DICTIONARY_COPY.es;
    setText(dictionary.querySelector(".feature-hero .tag"), copy.tag);
    setText(dictionary.querySelector(".feature-hero h2"), copy.title);
    setText(dictionary.querySelector(".feature-hero p"), copy.intro);

    const search = dictionary.querySelector("#dictionarySearch");
    if (search && search.placeholder !== copy.search) search.placeholder = copy.search;

    const counter = dictionary.querySelector("#dictionaryCount");
    const counterNumbers = counter?.textContent.match(/\d+/g) || [];
    if (counter && counterNumbers.length >= 2) {
      const matches = Number(counterNumbers[1]);
      setText(counter, copy.counter
        .replace("{total}", counterNumbers[0])
        .replace("{matches}", counterNumbers[1])
        .replace("{result}", matches === 1 ? copy.resultOne : copy.resultMany));
    }

    dictionary.querySelectorAll(".dictionary-entry small").forEach(node => {
      const detail = node.textContent.trim();
      if (DICTIONARY_FALLBACKS.has(detail) || /^Fuente\s+Ñe['’]ẽryru\b/i.test(detail)) setText(node, copy.fallback);
    });
    dictionary.querySelectorAll(".sound-empty").forEach(node => {
      if (DICTIONARY_EMPTY_STATES.has(node.textContent.trim())) setText(node, copy.empty);
    });
    dictionary.querySelectorAll("[data-pronounce]").forEach(button => {
      const word = button.closest(".dictionary-entry")?.querySelector("b")?.textContent.trim() || "";
      button.setAttribute("aria-label", `${copy.listen} ${word}`.trim());
    });

    const more = dictionary.querySelector("#dictionaryMore");
    const remaining = more?.textContent.match(/\d+/)?.[0];
    if (more && remaining) setText(more, copy.more.replace("{remaining}", remaining));
  }

  function installDictionaryLocalization() {
    const dictionary = document.querySelector("#dictionary");
    localizePublicDictionary();
    if (dictionary) {
      new MutationObserver(() => queueMicrotask(localizePublicDictionary)).observe(dictionary, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    new MutationObserver(localizePublicDictionary).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"]
    });
    document.querySelectorAll("#headerLang, #lang").forEach(select => {
      select.addEventListener("change", () => queueMicrotask(localizePublicDictionary));
    });
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
    document.body.removeAttribute("aria-busy");
    const boot = document.querySelector("#nalviBoot");
    if (boot) {
      boot.setAttribute("aria-hidden", "true");
      boot.removeAttribute("aria-live");
      boot.remove();
    }
    window.dispatchEvent(new CustomEvent("nalvi:ready", { detail: { state: bootState } }));
  }

  async function stabilizeInitialRender() {
    updateBootCopy();
    removeLegacyHomeHero();
    stabilizePublicSurface();
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
    stabilizePublicSurface();
    installDictionaryLocalization();
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
          stabilizePublicSurface(node.matches?.(".insta-cta, .follow-label, .dictionary-source") ? node.parentElement : node);
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
    version: "NALVI-BOOT-2-VISUAL-STABLE",
    get state() { return bootState; },
    audit: () => ({
      state: bootState,
      legacyHomeHeroPresent: Boolean(document.querySelector("#home .hero-art")),
      legacyAcademicPromotionPresent: Boolean(document.querySelector("#course .insta-cta, #videos .insta-cta, .follow-label")),
      publicDictionarySourcePresent: Boolean(document.querySelector("#dictionary .dictionary-source")),
      designSystemLinkedBeforeBody: true,
      waitsForSecondaryAcademicQueries: false,
      firebaseRulesChanged: false
    })
  });
})();
