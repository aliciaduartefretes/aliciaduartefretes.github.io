import { CATALOG_EXAMPLES } from "../activity-catalog/catalog-examples.mjs";
import { catalogAudit } from "../activity-catalog/nalvi-activity-catalog.mjs";
import { catalogQualityMetrics, validateCatalogActivity } from "../activity-catalog/nalvi-activity-quality.mjs";

const gallery = document.querySelector("#catalogGallery");
const localePicker = document.querySelector("#galleryLocale");
const summary = document.querySelector("#gallerySummary");
const audit = catalogAudit();

function renderSummary() {
  const metrics = catalogQualityMetrics(CATALOG_EXAMPLES, { attemptNumber: 1 });
  const hardZeros = Object.values(metrics).every(value => value === 0);
  summary.innerHTML = `
    <article class="summary-card"><b>${audit.enabledTypes.length}</b><span>tipos habilitados</span></article>
    <article class="summary-card"><b>${audit.disabledTypes.length}</b><span>tipos reservados/desactivados</span></article>
    <article class="summary-card"><b>${hardZeros ? "0" : "!"}</b><span>fallos en métricas duras</span></article>
    <article class="summary-card"><b>${audit.paso8cStarted ? "Sí" : "No"}</b><span>PASO 8C iniciado</span></article>`;
}

function renderExample(activity, host, resultNode, locale) {
  window.renderActivity(activity, {
    target: host,
    language: locale,
    onSubmit(result) {
      resultNode.textContent = result.correct
        ? "Estado de prueba: respuesta correcta registrada."
        : "Estado de prueba: respuesta incorrecta registrada; el avance queda bloqueado.";
      resultNode.dataset.correct = String(Boolean(result.correct));
      host.dataset.nalviSubmissionLocked = "false";
      return result;
    }
  });
}

function renderGallery() {
  const locale = localePicker.value;
  document.documentElement.lang = locale;
  gallery.innerHTML = `<aside class="gallery-note"><strong>Control visual y funcional</strong>Cada tarjeta usa el renderizador oficial. Los nombres técnicos y la validación aparecen solo en esta galería de revisión.</aside>`;
  for (const sourceActivity of CATALOG_EXAMPLES) {
    const activity = structuredClone(sourceActivity);
    const validation = validateCatalogActivity(activity, { uiLocale: locale, attemptNumber: 1 });
    const card = document.createElement("article");
    card.className = "catalog-demo";
    card.innerHTML = `<header class="catalog-demo__head"><h2>${activity.activityType}</h2><span class="validation-badge ${validation.valid ? "" : "is-invalid"}">${validation.valid ? "SCHEMA + QUALITY OK" : validation.reasons.join(" · ")}</span></header><div class="catalog-demo__viewport"><div data-demo-host></div><p class="catalog-demo__result" data-demo-result aria-live="polite">Estado inicial listo.</p><div class="catalog-demo__tools"><button type="button" data-demo-reset>Estado inicial</button><button type="button" data-demo-help>Vista con ayuda</button><button type="button" data-demo-mobile>Vista 390 px</button></div></div>`;
    gallery.append(card);
    const host = card.querySelector("[data-demo-host]");
    const resultNode = card.querySelector("[data-demo-result]");
    renderExample(activity, host, resultNode, locale);
    card.querySelector("[data-demo-reset]").addEventListener("click", () => {
      card.classList.remove("gallery-mobile-preview");
      resultNode.textContent = "Estado inicial listo.";
      renderExample(activity, host, resultNode, locale);
    });
    card.querySelector("[data-demo-help]").addEventListener("click", () => {
      const guided = { ...activity, helpLevel: 1, hints: activity.hints?.length ? activity.hints : ["Observa el contexto y descarta primero una opción que no pertenece a la misma categoría."] };
      resultNode.textContent = "Estado de ayuda pedagógica visible.";
      renderExample(guided, host, resultNode, locale);
    });
    card.querySelector("[data-demo-mobile]").addEventListener("click", () => card.classList.toggle("gallery-mobile-preview"));
  }
}

localePicker.addEventListener("change", renderGallery);
renderSummary();
renderGallery();
