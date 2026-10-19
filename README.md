# DAM CRM App — Ionic 8 + Angular 18 Standalone + Supabase (RBAC, RLS & Storage)

- **Centro:** Instituto Nebrija de Formación Profesional
- **Ciclo:** 2º Desarrollo de Aplicaciones Multiplataforma (DAM)
- **Módulo:** Desarrollo de Interfaces (Código 0488)
- **Alumno:** Luis Lázaro Pimentel

---

## 1. Configuración en Supabase (`supabase/setup.sql`)

1. Crea un proyecto en [Supabase](https://supabase.com) y abre el **SQL Editor**.
2. Copia y ejecuta el contenido completo de [`supabase/setup.sql`](./supabase/setup.sql).
   - Creará el tipo `public.user_role`, las tablas `public.profiles` y `public.clients`, el trigger automático `handle_new_user()` (que asigna rol `'admin'` por defecto a cada usuario creado en `auth.users`), las políticas **RLS** de lectura pública y escritura restringida a `'admin'`, el bucket público `'gallery'` con sus políticas sobre `storage.objects` y 3 clientes de ejemplo.
3. En **Authentication → Users**, crea un usuario de prueba con Email y Contraseña (con `Auto Confirm User` activado).

---

## 2. Configuración de Variables de Entorno

Edita [`src/environments/environment.ts`](./src/environments/environment.ts) y [`src/environments/environment.prod.ts`](./src/environments/environment.prod.ts) con los datos de tu proyecto (**Project Settings → API** en Supabase):

```ts
export const environment = {
  production: false,
  supabaseUrl: 'https://TU_PROYECTO.supabase.co',
  supabaseKey: 'TU_ANON_PUBLIC_KEY',
  storageBucket: 'gallery'
};
```

*(También puedes introducir tu URL y Anon Key directamente desde el botón de configuración en la barra superior de la aplicación).*

---

## 3. Ejecución Local y Compilación para Vercel

```bash
# Instalar dependencias
npm install

# Ejecutar servidor de desarrollo (http://localhost:4200)
npm start

# Compilar build de producción en el directorio www/
npm run build
```

El archivo [`vercel.json`](./vercel.json) ya está preconfigurado con `"outputDirectory": "www"` y `rewrites` hacia `/index.html` para evitar errores 404 al recargar rutas como `/galeria` o `/storage-gallery`.

---

## 4. Generación del PDF de Entrega (`memoria_entrega.html`)

1. Guarda tus 4 capturas de pantalla en la carpeta `docs/` con los nombres:
   - `docs/captura1.png` (*1. Modal de Login al intentar CUD*)
   - `docs/captura2.png` (*2. CRUD de Clientes autenticado como Admin*)
   - `docs/captura3.png` (*3. Galería de Cards desde Supabase Storage*)
   - `docs/captura4.png` (*4. Políticas RLS y Bucket en Supabase*)
   *(O bien haz clic directamente sobre cada recuadro al abrir `memoria_entrega.html` en el navegador para seleccionar la imagen desde tu ordenador).*
2. Abre [`memoria_entrega.html`](./memoria_entrega.html) en Chrome o Edge, verifica tus enlaces a GitHub y Vercel y pulsa **"Guardar como PDF (A4)"** (`Ctrl + P` → Destino: Guardar como PDF → Márgenes: Predeterminados, Gráficos de fondo: Activados). Se generarán **exactamente 2 páginas A4**.
