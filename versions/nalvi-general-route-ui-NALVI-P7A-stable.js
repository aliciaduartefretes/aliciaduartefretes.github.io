/*
 * NALVI · PASO 5
 * Adaptador visual de la ruta de Guaraní General.
 *
 * Reutiliza la interfaz y el contenido heredado: cada objetivo abre la unidad
 * existente que le corresponde. No escribe progreso, no consulta Firebase y
 * no calcula dominio. Agrega un único listener delegado, identificado, para
 * repintar esta capa después del selector de idioma ya existente.
 */
(() => {
  "use strict";

  const curriculum = window.NALVI_GUARANI_GENERAL_CURRICULUM;
  if (!curriculum) return;

  const COPY = {
    es: { route: "Ruta por competencias", beginner: "Nivel inicial", next: "Siguiente objetivo", complete: "Ruta completada", modules: "módulos", objectives: "objetivos", variable: "práctica variable", objective: "Objetivo", cycle: "Ciclo de capacidades", overviewTitle: "Aprende para comunicarte, no para contar lecciones", overviewText: "Siete módulos conectan objetivos, conceptos y actividades. La práctica podrá variar según la evidencia de cada estudiante.", courseIntro: "Avanza por objetivos de aprendizaje. Cada objetivo conserva el contenido existente y prepara evidencia por habilidad.", progress: "Objetivos completados", locked: "Completa el objetivo anterior" },
    en: { route: "Competency path", beginner: "Beginner level", next: "Next objective", complete: "Path completed", modules: "modules", objectives: "objectives", variable: "variable practice", objective: "Objective", cycle: "Capability cycle", overviewTitle: "Learn to communicate, not to count lessons", overviewText: "Seven modules connect objectives, concepts and activities. Practice can later vary according to each learner's evidence.", courseIntro: "Progress through learning objectives. Each objective preserves existing content and prepares skill-based evidence.", progress: "Objectives completed", locked: "Complete the previous objective" },
    pt: { route: "Rota por competências", beginner: "Nível inicial", next: "Próximo objetivo", complete: "Rota concluída", modules: "módulos", objectives: "objetivos", variable: "prática variável", objective: "Objetivo", cycle: "Ciclo de capacidades", overviewTitle: "Aprenda para se comunicar, não para contar lições", overviewText: "Sete módulos conectam objetivos, conceitos e atividades. A prática poderá variar conforme as evidências de cada estudante.", courseIntro: "Avance por objetivos de aprendizagem. Cada objetivo preserva o conteúdo existente e prepara evidências por habilidade.", progress: "Objetivos concluídos", locked: "Conclua o objetivo anterior" },
    fr: { route: "Parcours par compétences", beginner: "Niveau débutant", next: "Objectif suivant", complete: "Parcours terminé", modules: "modules", objectives: "objectifs", variable: "pratique variable", objective: "Objectif", cycle: "Cycle de capacités", overviewTitle: "Apprendre à communiquer, pas à compter les leçons", overviewText: "Sept modules relient objectifs, concepts et activités. La pratique pourra varier selon les acquis de chaque élève.", courseIntro: "Progressez par objectifs d’apprentissage. Chaque objectif conserve le contenu existant et prépare des preuves par compétence.", progress: "Objectifs terminés", locked: "Terminez l’objectif précédent" },
    it: { route: "Percorso per competenze", beginner: "Livello iniziale", next: "Obiettivo successivo", complete: "Percorso completato", modules: "moduli", objectives: "obiettivi", variable: "pratica variabile", objective: "Obiettivo", cycle: "Ciclo delle capacità", overviewTitle: "Impara a comunicare, non a contare lezioni", overviewText: "Sette moduli collegano obiettivi, concetti e attività. La pratica potrà variare in base alle evidenze di ogni studente.", courseIntro: "Avanza per obiettivi di apprendimento. Ogni obiettivo conserva il contenuto esistente e prepara evidenze per abilità.", progress: "Obiettivi completati", locked: "Completa l’obiettivo precedente" },
    de: { route: "Kompetenzbasierter Lernweg", beginner: "Anfängerniveau", next: "Nächstes Ziel", complete: "Lernweg abgeschlossen", modules: "Module", objectives: "Lernziele", variable: "variable Übung", objective: "Lernziel", cycle: "Kompetenzzyklus", overviewTitle: "Kommunizieren lernen statt Lektionen zählen", overviewText: "Sieben Module verbinden Ziele, Konzepte und Aktivitäten. Die Übung kann später je nach Lernnachweis variieren.", courseIntro: "Lerne anhand von Lernzielen. Jedes Ziel bewahrt vorhandene Inhalte und bereitet kompetenzbezogene Nachweise vor.", progress: "Abgeschlossene Lernziele", locked: "Schließe zuerst das vorherige Lernziel ab" }
  };
  const MODULE_ICONS = ["🌱", "🏡", "🗣️", "🧭", "🧱", "⏳", "🧩"];
  const MODULE_THEMES = [
    { soft: "#f0ecff", border: "#c6b4eb", accent: "#6d4cc1" },
    { soft: "#eaf8f3", border: "#a4d7c8", accent: "#2e846f" },
    { soft: "#fff2e9", border: "#e8b5a6", accent: "#be624f" },
    { soft: "#fff7d9", border: "#e7cd72", accent: "#9a6b0c" },
    { soft: "#eef4ff", border: "#b9cceb", accent: "#456da9" },
    { soft: "#fff0f5", border: "#e6b8c8", accent: "#a6496a" },
    { soft: "#eef8f4", border: "#afd7c8", accent: "#327963" }
  ];
  const PHASE_BY_SKILL = {
    listening: "ESCUCHA",
    comprehension: "ENTIENDE",
    reading: "ENTIENDE",
    vocabulary: "ENTIENDE",
    construction: "CONSTRUYE",
    "grammar-awareness": "CONSTRUYE",
    "pronunciation-awareness": "HABLA",
    speaking: "HABLA",
    application: "APLICA",
    interaction: "APLICA",
    "mastery-evidence": "DOMINA"
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const currentLanguage = () => {
    const candidate = typeof lang !== "undefined" ? lang : document.documentElement.lang;
    return curriculum.languages.includes(candidate) ? candidate : "es";
  };
  const localized = (value, language = currentLanguage()) => curriculum.localize(value, language);
  const stateDone = () => new Set(typeof state !== "undefined" && Array.isArray(state.done) ? state.done.map(Number) : []);
  const legacyIndex = objective => Number(objective.legacyContentRefs?.[0]?.legacyUnitIndex);
  const completedObjectives = () => {
    const done = stateDone();
    return curriculum.learningObjectives.filter(objective => done.has(legacyIndex(objective)));
  };
  const phaseLabels = (objective, language) => {
    const ids = [...new Set(objective.skills.map(skill => PHASE_BY_SKILL[skill]).filter(Boolean))];
    return ids.slice(0, 4).map(id => localized(curriculum.pedagogicalCycle.find(phase => phase.id === id)?.label, language));
  };

  function renderRouteUnits() {
    const root = document.querySelector("#units");
    if (!root) return;
    const language = currentLanguage();
    const copy = COPY[language] || COPY.es;
    const done = stateDone();
    const completedCount = completedObjectives().length;
    let routePosition = 0;
    root.innerHTML = curriculum.modules.map((module, moduleIndex) => {
      const theme = MODULE_THEMES[moduleIndex] || MODULE_THEMES[0];
      const objectives = module.learningObjectiveIds.map(id => curriculum.getLearningObjective(id)).filter(Boolean);
      const moduleCompleted = objectives.filter(objective => done.has(legacyIndex(objective))).length;
      const cards = objectives.map(objective => {
        const position = routePosition++;
        const index = legacyIndex(objective);
        const locked = !window.isCourseAuthor && position > completedCount;
        const complete = done.has(index);
        const concept = curriculum.getConcept(objective.conceptIds[0]);
        const phases = phaseLabels(objective, language);
        return `<article class="unit ${locked ? "locked" : ""}" data-i="${index}" data-learning-objective-id="${esc(objective.id)}" title="${locked ? esc(copy.locked) : ""}"><div class="unit-icon" style="--tone:${theme.soft}">${complete ? "✓" : esc(MODULE_ICONS[moduleIndex] || "🎯")}</div><div><h3>${module.order}.${objective.order} ${esc(localized(concept?.title, language))}</h3><p>${esc(localized(objective.canDo, language))}</p><div class="unit-meta">🎯 ${esc(copy.objective)} · ${esc(objective.difficulty)}${complete ? " · ✓" : ""}</div><div class="unit-skill-chips">${phases.map(label => `<span>${esc(label)}</span>`).join("")}</div></div><div class="arrow">${locked ? "🔒" : "›"}</div></article>`;
      }).join("");
      return `<section class="general-module" style="--module-soft:${theme.soft};--module-border:${theme.border};--module-accent:${theme.accent}"><div class="general-module-head"><span class="general-module-icon">${esc(MODULE_ICONS[moduleIndex] || "🎯")}</span><div><h3>${module.order}. ${esc(localized(module.title, language))}</h3><p>${esc(localized(module.description, language))} · ${moduleCompleted}/${objectives.length}</p></div></div>${cards}</section>`;
    }).join("");
    root.querySelectorAll(".unit:not(.locked)").forEach(card => {
      card.onclick = () => {
        if (typeof openUnit === "function") openUnit(Number(card.dataset.i));
      };
    });
    paintGeneralSurfaces();
  }

  function paintGeneralOverview() {
    const language = currentLanguage();
    const copy = COPY[language] || COPY.es;
    const completed = completedObjectives().length;
    const percent = Math.round(completed / curriculum.learningObjectives.length * 100);
    const panel = document.querySelector("#generalProOverview");
    if (panel) panel.innerHTML = `<div class="pro-course-overview"><div class="pro-overview-top"><div><span class="pro-eyebrow">${esc(copy.route)} · ${esc(copy.beginner)}</span><h3>${esc(copy.overviewTitle)}</h3><p>${esc(copy.overviewText)}</p></div><div class="pro-kpis"><div class="pro-kpi"><b>${curriculum.modules.length}</b><small>${esc(copy.modules)}</small></div><div class="pro-kpi"><b>${curriculum.learningObjectives.length}</b><small>${esc(copy.objectives)}</small></div><div class="pro-kpi"><b>∞</b><small>${esc(copy.variable)}</small></div></div></div><div class="pro-outcomes">${curriculum.pedagogicalCycle.map(phase => `<div class="pro-outcome">${esc(localized(phase.label, language))}</div>`).join("")}</div><div class="pro-progress"><div class="pro-progress-head"><span>${esc(copy.progress)}</span><span>${completed}/${curriculum.learningObjectives.length}</span></div><div class="pro-progress-track"><i style="width:${percent}%"></i></div></div></div>`;
    const intro = document.querySelector("#course .course-head p");
    if (intro) intro.textContent = copy.courseIntro;
    const tag = document.querySelector('#course [data-ui="unitsTag"]');
    if (tag) tag.textContent = `${copy.route} · ${copy.beginner}`;
  }

  function paintCatalog() {
    const language = currentLanguage();
    const copy = COPY[language] || COPY.es;
    const generalCard = document.querySelector("#openGeneralCourse")?.closest(".course-card");
    const stats = generalCard?.querySelectorAll(".course-card-stats span");
    if (stats?.[0]) stats[0].textContent = `${curriculum.modules.length} ${copy.modules}`;
    if (stats?.[1]) stats[1].textContent = `${curriculum.learningObjectives.length} ${copy.objectives}`;
    if (stats?.[2]) stats[2].textContent = copy.variable;
  }

  function paintHome() {
    const language = currentLanguage();
    const copy = COPY[language] || COPY.es;
    const done = stateDone();
    const completed = completedObjectives().length;
    const percent = Math.round(completed / curriculum.learningObjectives.length * 100);
    const next = curriculum.learningObjectives.find(objective => !done.has(legacyIndex(objective)));
    const nextConcept = next ? curriculum.getConcept(next.conceptIds[0]) : null;
    const status = document.querySelector("#homeLessonStatus");
    if (status) status.textContent = next ? `${copy.next}: ${localized(nextConcept?.title, language)}` : copy.complete;
    const subtitle = document.querySelector('[data-home-text="fromZero"]');
    if (subtitle) subtitle.textContent = copy.route;
    const percentNode = document.querySelector("#homeProgressPercent");
    if (percentNode) percentNode.textContent = `${percent}%`;
    document.querySelector("#homeProgressRing")?.style.setProperty("--p", percent);
    const bar = document.querySelector("#homeProgressBar");
    if (bar) bar.style.width = `${percent}%`;
  }

  function paintGeneralSurfaces() {
    paintHome();
    paintCatalog();
    paintGeneralOverview();
  }

  const originalRenderHomeDashboard = typeof renderHomeDashboard === "function" ? renderHomeDashboard : null;
  if (originalRenderHomeDashboard) {
    renderHomeDashboard = function nalviRouteHomeDashboard() {
      originalRenderHomeDashboard();
      paintGeneralSurfaces();
    };
  }
  if (typeof renderUnits === "function") renderUnits = renderRouteUnits;
  const originalShow = typeof show === "function" ? show : null;
  if (originalShow) {
    show = function nalviRouteShow(sectionId, ...args) {
      const result = originalShow(sectionId, ...args);
      if (sectionId === "course") setTimeout(renderRouteUnits, 0);
      return result;
    };
  }
  const originalTranslateUI = typeof translateUI === "function" ? translateUI : null;
  if (originalTranslateUI) {
    translateUI = function nalviRouteTranslateUI() {
      originalTranslateUI();
      paintGeneralSurfaces();
      if (!document.querySelector("#course")?.classList.contains("hide")) renderRouteUnits();
    };
  }

  if (!document.documentElement.dataset.nalviRouteLanguageBound) {
    document.documentElement.dataset.nalviRouteLanguageBound = "true";
    document.addEventListener("change", event => {
      if (!event.target?.matches?.("#headerLang, #lang")) return;
      setTimeout(() => {
        paintGeneralSurfaces();
        if (!document.querySelector("#course")?.classList.contains("hide")) renderRouteUnits();
      }, 220);
    });
  }

  paintGeneralSurfaces();
  if (!document.querySelector("#course")?.classList.contains("hide")) renderRouteUnits();
  setTimeout(() => {
    paintGeneralSurfaces();
    if (!document.querySelector("#course")?.classList.contains("hide")) renderRouteUnits();
  }, 400);

  window.NALVI_GUARANI_GENERAL_ROUTE_UI = Object.freeze({
    version: "NALVI-P5-ROUTE-UI-1",
    render: renderRouteUnits,
    repaint: paintGeneralSurfaces,
    audit: () => ({
      courseId: curriculum.route.courseId,
      modulesRendered: curriculum.modules.length,
      learningObjectivesRendered: curriculum.learningObjectives.length,
      fixedLessonCountShown: false,
      writesProgress: false,
      calculatesMastery: false,
      firebaseChanged: false,
      artificialIntelligenceConnected: false
    })
  });
})();
