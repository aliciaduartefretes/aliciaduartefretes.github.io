# NALVI — PRE-8C · Habilitación gramatical normativa

## Decisión

**PASO 8C todavía no puede comenzar.**

El material ya investigado permite verificar normativamente un componente real del patrón areal: el inventario de marcadores personales, la distinción inclusivo/exclusivo y la alternancia oral/nasal `ja-/ña-` de primera persona plural inclusiva. No permite todavía obtener una forma verbal real sin inferir datos ausentes.

La política aplicada es conservadora: un patrón puede tener componentes `normativeVerified` y continuar con `allowedForGeneration: false`. Verificación parcial no equivale a productividad.

## Material revisado

Se utilizaron exclusivamente:

- el informe de PASO 0.5 ya guardado;
- la fuente oficial ya registrada como `S-001`;
- `knowledge-base/pilot-corpus.json`;
- `knowledge-base/governance.json`;
- el Grammar Engine existente;
- los conflictos `C-001` y `C-002`.

No se realizó una investigación general nueva. No se consultó OpenAI. Los 20 sentidos léxicos previamente habilitados no fueron modificados.

## Resultado cuantitativo

| Comprobación | Resultado |
|---|---:|
| Patrones `normativeVerified` | 1 |
| Patrones `expertVerified` | 0 |
| Patrones productivos | 0 |
| Lemas verbales productivos | 0 |
| Formas verbales reales disponibles | 0 |
| Combinaciones habilitadas ejecutadas con `getValidatedVerbForm()` | 0 |

No existe ninguna combinación habilitada que pueda ejecutarse como forma real. Por eso no se simula una conjugación para cumplir artificialmente la prueba.

## Patrón areal: alcance exacto autorizado

- ID: `CP-AREAL-001`
- Fuente: `S-001`, páginas 102–103
- Estado: `normativeVerified`
- Componentes autorizados: `personMarkers`, `inclusiveExclusive`, `oralNasalInclusiveAlternation`
- Uso autorizado: `personMarkerReference`
- `allowedForGeneration`: `false`
- `conjugationGeneration`: `false`

Personas documentadas: `1sg`, `2sg`, `3sg`, `1pl-inclusive`, `1pl-exclusive`, `2pl`, `3pl`.

La variante oral/nasal documentada en este alcance corresponde al marcador inclusivo: `ja-` / `ña-`. Esto no constituye por sí solo formas verbales completas.

## Comportamiento comprobado del motor

La función conserva su política de no invención:

- registro inexistente → `unavailable`;
- candidato no revisado → `reviewRequired`;
- dependencia de `C-001` → `conflict`;
- dependencia de `C-002` → `conflict`.

El contrato de una futura respuesta `available` ya incluye `form`, `lemma`, `person`, `pattern`, `source` y `validationStatus`. Las pruebas técnicas que producen formas utilizan cadenas abstractas de fixture y no son conocimiento guaraní.

## Datos normativos que faltan

Para habilitar al menos un piloto productivo se necesita, con localizador Nivel A exacto:

1. un lema verbal inequívocamente asignado al patrón areal;
2. su raíz o forma subyacente;
3. su perfil oral/nasal;
4. una regla explícita de orden y realización morfológica, o el paradigma completo de formas exactas;
5. las excepciones y transformaciones necesarias, o evidencia de que no se requieren en ese alcance.

Sin esos datos, `prefijo + lema` sería una inferencia no autorizada.

## Reglas bloqueadas

- `CP-AIREAL-001`: bloqueado por `C-002`.
- `CP-HAREAL-001`: bloqueado por `C-001`.
- categorías verbalizadas/chendales: sin subconjunto computable completo y autorizado en el material existente.
- negación y demás extensiones: fuera del piloto mínimo y sin reglas productivas habilitadas.

## Firebase y OpenAI

No se modificó Firebase ni Firebase Rules. No existe acción manual requerida en Firebase para este PRE-8C. OpenAI no fue utilizado y no tiene autoridad para completar las formas faltantes.

## Cierre

La infraestructura quedó preparada para distinguir verificación normativa parcial de autorización productiva. La compuerta de PASO 8C permanece cerrada hasta incorporar la evidencia normativa faltante.
