# Activar Comunidad NALVI en Firebase

Estas reglas permiten que cualquier visitante lea la Comunidad, pero exigen una cuenta real de Google/NALVI para publicar, responder, dar Me gusta o registrar una visualización.

## Cómo publicarlas

1. Abre [Firebase Console · Firestore Rules](https://console.firebase.google.com/project/guaraniconali/firestore/rules).
2. Entra en la pestaña **Reglas** si Firebase no la abre automáticamente.
3. Abre el archivo `REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules` de esta misma carpeta.
4. Selecciona y copia **todo** su contenido.
5. En Firebase, reemplaza todo el contenido del editor por el bloque copiado.
6. Pulsa **Publicar** una sola vez.
7. Espera el mensaje de confirmación de Firebase y avisa a Codex con la palabra **listo**.

## Qué protegen

- La lectura del feed es pública.
- Las sesiones anónimas no pueden escribir.
- Cada publicación y respuesta queda vinculada al UID y nombre verificado de la cuenta.
- Una persona no puede editar ni borrar el contenido de otra.
- Un usuario solo puede tener un Me gusta y una visualización por publicación.
- Los textos tienen límites de longitud.
- Las demás colecciones de NALVI conservan sus reglas actuales.
- Todo lo no declarado continúa bloqueado.

Estas reglas fueron verificadas primero con el emulador local de Firestore. Publicarlas no crea, borra ni migra documentos existentes.
