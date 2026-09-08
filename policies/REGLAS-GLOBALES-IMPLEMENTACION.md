# NALVI — Reglas globales de implementación

**Estado:** obligatorias durante todos los pasos posteriores  
**Confirmadas en:** PASO 4

## Disciplina por pasos

- Ejecutar un solo paso a la vez.
- Mantener una versión estable recuperable antes de avanzar.
- Al terminar, documentar cambios, archivos y funciones, pruebas, errores o riesgos y funciones conservadas.
- Detenerse y no iniciar automáticamente el paso siguiente.

## Idiomas de interfaz

Se conservan español, inglés, portugués, francés, italiano y alemán. El selector, la traducción instantánea y el cambio sin recarga son obligatorios.

El idioma de interfaz es independiente del idioma aprendido. Una interfaz en inglés puede utilizarse para estudiar guaraní.

Todos los pasos deben verificar los seis idiomas, no solo español e inglés.

## Resolución antes de IA

Orden obligatorio:

1. lógica local;
2. reglas determinísticas;
3. Firebase;
4. Knowledge Base;
5. Grammar Engine;
6. actividades existentes y validadas;
7. caché y reutilización.

Antes de una llamada futura debe evaluarse `canResolveWithoutAI`. Si es `true`, OpenAI no puede utilizarse.

OpenAI no puede resolver respuestas exactas, multiple choice, matching, orden conocido, XP, vidas, progreso, mastery básico, conjugaciones conocidas, reglas gramaticales, selección de actividades existentes, navegación, renderizado ni traducciones validadas.

En el PASO 4 OpenAI permanece desconectado. Un vacío lingüístico, dato pendiente o conflicto tampoco autoriza a la IA a inventar una forma: el Grammar Engine devuelve `unavailable`, `reviewRequired` o `conflict` y mantiene `aiPermitted: false`.

## Lotes de audio y video

Cada nuevo audio humano debe incorporarse al manifiesto autorizado, quedar asociado a una entrada buscable del diccionario, mostrar el control de escucha en cualquier ejercicio o contenido donde aparezca esa palabra y sumarse automáticamente a la práctica auditiva. La importación debe conservar una ruta canónica, un identificador único y un checksum verificable.

Cada nuevo video docente debe aparecer en la biblioteca de videos con título y búsqueda interna. La interfaz no puede mostrar la URL de origen, ofrecer un botón para copiarla ni conceder permiso de portapapeles al reproductor. Los videos externos se reproducen dentro de NALVI mediante un embed restringido.
