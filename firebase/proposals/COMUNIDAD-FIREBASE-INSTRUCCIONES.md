# Activar Comunidad NALVI en Firebase

Estas reglas permiten que cualquier visitante lea la Comunidad, pero exigen una cuenta real de Google/NALVI para publicar, responder, dar Me gusta, seguir personas o registrar una visualización. Esta versión también admite las referencias seguras a avatar, portada, imágenes y enlaces HTTPS de Recursos.

IMPORTANTE: no utilizar el bloque abreviado enviado anteriormente en el chat. El archivo `REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules` es la única versión completa. Se genera insertando Comunidad dentro de las reglas vigentes y una prueba automática confirma que no cambia ningún otro carácter.

## Cómo publicarlas

1. Abre [Firebase Console · Firestore Rules](https://console.firebase.google.com/project/guaraniconali/firestore/rules).
2. Entra en la pestaña **Reglas** si Firebase no la abre automáticamente.
3. Abre el archivo `REGLAS-FIRESTORE-COMUNIDAD-PARA-COPIAR.rules` de esta misma carpeta.
4. Selecciona y copia **todo** su contenido.
5. En Firebase, reemplaza todo el contenido del editor por el bloque copiado.
6. Pulsa **Publicar** una sola vez.
7. Espera el mensaje de confirmación de Firebase y avisa a Codex con la palabra **listo**.

Después publica también las reglas separadas de Firebase Storage siguiendo `COMUNIDAD-STORAGE-INSTRUCCIONES.md`. Firestore autoriza los datos sociales; Storage autoriza los archivos de imagen. Se necesitan ambas partes para que la subida de fotos funcione.

## Qué protegen

- La lectura del feed es pública.
- Las sesiones anónimas no pueden escribir.
- Cada publicación y respuesta queda vinculada al UID y nombre verificado de la cuenta.
- Una persona no puede editar ni borrar el contenido de otra.
- Un usuario solo puede tener un Me gusta y una visualización por publicación.
- Cada usuario administra su propio perfil y solo puede seguir desde su propia cuenta.
- Los textos tienen límites de longitud.
- Las rutas de imágenes deben pertenecer al mismo UID que publica.
- Los enlaces de Recursos deben comenzar con `https://`.
- Las demás colecciones de NALVI conservan sus reglas actuales.
- Todo lo no declarado continúa bloqueado.

La estructura y el aislamiento de estas reglas cuentan con pruebas automáticas. En este Mac, la ejecución del emulador quedó pendiente porque Firebase Emulator Suite requiere Java. Publicarlas no crea, borra ni migra documentos existentes.
