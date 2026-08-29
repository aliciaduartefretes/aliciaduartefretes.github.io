# NALVI — Política global de IA pedagógica selectiva

**Estado:** obligatoria para todos los pasos posteriores  
**Versión:** 2.1.0  
**Implementación vigente:** `generateReinforcementActivity` (PASO 7B) y planificación selectiva de intervenciones después de un error (PASO 8).  
**No existe chatbot.**

## Principio

NALVI corrige localmente toda respuesta objetiva. OpenAI no puntúa, no actualiza XP, vidas, progreso ni Mastery, y no consulta una respuesta ya disponible en el Grammar Engine.

La corrección y la intervención son decisiones diferentes:

1. `canScoreWithoutAI`: indica si la respuesta puede corregirse localmente.
2. `wouldAIImproveIntervention`: indica si, después de corregirla, una intervención con IA podría enseñar mejor.

Que `canScoreWithoutAI === true` prohíbe usar OpenAI para **corregir**, pero no impide evaluar posteriormente `wouldAIImproveIntervention`.

## Resolución local obligatoria

NALVI resuelve sin OpenAI:

- corrección objetiva;
- multiple choice, matching y orden conocido;
- respuestas exactas;
- XP, vidas y progreso;
- actualización básica de Mastery;
- consultas al Grammar Engine;
- navegación y renderizado.

OpenAI no se llama únicamente para decir “Incorrecto”, evitar una operación simple o consultar una respuesta ya conocida.

## Intervención posterior al error

Después de una respuesta incorrecta, OpenAI puede utilizarse desde Vercel server-side cuando permita diagnosticar mejor el error, elegir estrategia, cambiar modalidad, personalizar una explicación o evitar repetición mecánica.

La llamada requiere contexto lingüístico con `validationStatus: "normativeVerified"` o `validationStatus: "expertVerified"`, `allowedForGeneration: true` y ausencia de conflictos. La salida debe ser JSON estructurado, validarse antes de usarse y disponer de fallback local.

`normativeVerified` significa verificación directa contra una fuente normativa oficial Nivel A, con localizador exacto y alcance inequívoco. No significa revisión por una persona experta. Solo autoriza la acepción y los usos expresamente registrados; no habilita ejemplos, oraciones, conjugaciones ni inferencias adicionales.

El PASO 8 autoriza a OpenAI únicamente a mejorar el diagnóstico o la selección de estrategia. Todavía no autoriza generar libremente una secuencia completa.

## Regla de no repetición

`sameConcept !== sameExercise`

Después de un error no puede mostrarse exactamente la misma actividad. La huella compara como mínimo `conceptId`, `activityType`, prompt, instrucción, opciones, respuesta, media y contexto.

Debe cumplirse `nextFingerprint !== previousFingerprint`. Se prefiere cambiar de modalidad. Si por necesidad pedagógica se mantiene el tipo, deben cambiar prompt, contexto, opciones, soporte o nivel de guía, y registrarse la razón.

## Privacidad y seguridad

- API key únicamente server-side.
- No enviar nombre, correo, institución, rol ni identificadores administrativos.
- Enviar solo contexto pedagógico pseudonimizado.
- Mantener los seis idiomas de interfaz y respetar `uiLocale`.
- El guaraní es el idioma objetivo del ecosistema actual.

## Costos y observabilidad

La prioridad es enseñar mejor, no minimizar tokens a cualquier costo. Se registran llamadas, tokens, latencia, errores y costo estimado cuando existe una tarifa configurada para el modelo.

## Persistencia y fallback

Las intervenciones se registran server-side como eventos pedagógicos dentro de la ruta segura existente `users/{uid}/learningEvents/{eventId}`. El registro lógico se identifica como `interventionEvents`, sin depender exclusivamente de `localStorage`.

Si OpenAI falla, no responde, supera límites o no existe conocimiento autorizado suficiente, NALVI aplica el plan local, selecciona una actividad distinta y continúa enseñando.
