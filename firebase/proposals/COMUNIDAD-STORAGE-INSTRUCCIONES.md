# Activar imágenes de Comunidad NALVI

Estas reglas habilitan únicamente las imágenes de perfil, portada y publicaciones de Comunidad. No habilitan archivos generales ni escrituras anónimas.

## Cómo publicarlas

1. Abre [Firebase Console · Storage Rules](https://console.firebase.google.com/project/guaraniconali/storage/rules).
2. Entra en la pestaña **Reglas**.
3. Copia todo el archivo `REGLAS-STORAGE-COMUNIDAD-PARA-COPIAR.rules`.
4. Reemplaza el contenido del editor por ese bloque.
5. Pulsa **Publicar** una sola vez.

## Qué protegen

- Solo una cuenta real autenticada puede subir imágenes.
- Cada usuario escribe exclusivamente dentro de su propia carpeta.
- Solo se aceptan JPEG, PNG y WebP.
- Cada imagen puede ocupar como máximo 5 MB.
- Avatar y portada tienen nombres fijos y no crean copias ilimitadas.
- Las imágenes de publicaciones usan identificadores aleatorios.
- Todo lo que no pertenece a Comunidad continúa denegado.

Las imágenes son de lectura pública porque acompañan un feed público. No deben contener datos privados.

La estructura y el aislamiento de estas reglas cuentan con pruebas automáticas. En este Mac, la ejecución del emulador quedó pendiente porque Firebase Emulator Suite requiere Java.
