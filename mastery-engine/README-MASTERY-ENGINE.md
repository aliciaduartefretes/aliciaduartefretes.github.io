# Mastery Engine · contrato previo a integración

## Uso

El motor es puro y determinístico. Todas las cifras provienen de `mastery-config.json`; el módulo no contiene secretos, red, Firebase ni OpenAI.

Flujo conceptual:

1. `createMasteryProfile(...)`
2. `applyLearningEvent(profile, input, config)`
3. persistir `event` como evidencia inmutable desde backend seguro;
4. persistir `profile` derivado desde backend seguro;
5. `getAdaptiveDecision(profile, config)`
6. `selectRecommendedActivityType(profile, config)`

## Autoridad

El navegador podrá enviar una interacción autenticada, pero no determinar `evidenceWeight`, `masteryBefore`, `masteryAfter`, `status` ni `nextReviewAt`. Esos campos deben recalcularse en servidor.

## Compatibilidad con PASO 5

Los alias de habilidades mapean el currículo existente hacia las siete dimensiones del PASO 6:

- comprehension → reading
- construction → writing
- interaction → application
- grammar-awareness → grammar
- pronunciation-awareness → speaking

El currículo no fue reescrito ni reducido.
