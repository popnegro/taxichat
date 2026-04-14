# TaxiChat - SaaS de Marca Blanca para Gestión de Taxis

TaxiChat es una solución integral de transporte tipo "White-Label" diseñada para permitir que múltiples agencias de taxis operen bajo su propia identidad visual, utilizando una infraestructura compartida, segura y escalable.

## 🚀 Arquitectura del Proyecto

El sistema utiliza un stack moderno basado en **Node.js (Express)**, **MongoDB**, **Supabase (Realtime Broadcast)** para mensajería y **Mercado Pago** para la gestión de pagos. La arquitectura es *Serverless-ready* y soporta despliegues multi-subdominio en **Vercel**.

## 📁 Funciones de los Archivos

### 🛠️ Backend (Núcleo)

*   **`/api/index.js`**: Punto de entrada unificado. Gestiona la autenticación JWT (Access & Refresh Tokens), validación de esquemas con Joi, renderizado dinámico de SEO/JSON-LD, generación automática de `sitemap.xml` y procesamiento de Webhooks de pago.
*   **`vercel.json`**: Define los *rewrites* para manejar URLs amigables y la inyección de lógica de servidor en archivos estáticos.
*   **`vercel.json`**: Configuración de despliegue para Vercel, gestionando el ruteo de funciones serverless y archivos estáticos.
*   **`.env`**: Archivo de configuración para variables de entorno (Credenciales de DB, Supabase, API Keys).

### 🗄️ Modelos (Base de Datos)

*   **`/models/Empresa.js`**: Esquema de Mongoose que define a los inquilinos (tenants). Almacena el `slug`, colores de marca, logo y tokens específicos de Mercado Pago.
*   **`/models/Viaje.js`**: Registro de pedidos. Incluye trazabilidad de estados, calificación de usuario (estrellas) y vinculación con transacciones de Mercado Pago.

### 💻 Frontend: Paneles de Operación

*   **`/public/console.html`**: **Panel del SuperAdmin**. Vista global de todos los pedidos del ecosistema en tiempo real. Requiere `SUPERADMIN_SECRET`.
*   **`/public/empresa_console.html`**: **Panel del Operador**. Gestión local de flota. Incluye login persistente vía JWT, sonidos de notificación y confirmación segura de viajes.

### 📱 Frontend: Experiencia del Cliente

*   **`/public/reserva.html`**: **Layout SaaS Dinámico**. Landing page con secciones de marketing e inyección de marca blanca. Utiliza *Skeleton Screens* para mejorar el LCP (Largest Contentful Paint).
*   **`/public/client.html`**: **Widget de Reserva**. Formulario optimizado con Google Places API y sistema de feedback post-viaje (rating).
*   **`/public/index.html` / `/public/empresa.html`**: Páginas de marketing y aterrizaje que describen los beneficios del servicio para pasajeros y dueños de flotas.

## 🛠️ Tecnologías Utilizadas

*   **Backend**: Node.js, Express, Mongoose.
*   **Frontend**: Tailwind CSS, Supabase JS SDK (Realtime), Google Maps API.
*   **Pagos**: Mercado Pago SDK.
*   **Seguridad**: JWT + Refresh Tokens (HttpOnly Cookies), Joi (Validación), Express Rate Limit (DDoS Protection).
*   **SEO**: JSON-LD Estructurado, Sitemap XML Dinámico, Meta-tags dinámicos.

## ⚙️ Configuración Local

1.  **Instalar dependencias**:
    ```bash
    npm install
    ```

2.  **Configurar variables de entorno**:
    Crea un archivo `.env` basado en la siguiente estructura:
    ```env
    MONGO_URI=tu_uri_de_mongodb
    SUPABASE_URL=tu_url_de_supabase
    SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
    SUPABASE_ANON_KEY=tu_anon_key
    GOOGLE_MAPS_KEY=tu_google_maps_key
    OPERADOR_SECRET=token_para_operadores
    SUPERADMIN_SECRET=token_para_superadmin
    JWT_SECRET=clave_para_firmar_tokens
    JWT_REFRESH_SECRET=clave_para_refresh_tokens
    BASE_URL=http://localhost:3000
    ```

3.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```

## 🛡️ Flujo de Seguridad

*   **Validación**: Cada pedido es validado mediante esquemas de Joi antes de ingresar a la base de datos.
*   **Sesiones**: Los operadores utilizan JWT. El `accessToken` es de vida corta y el `refreshToken` se almacena en una cookie `HttpOnly` para prevenir ataques XSS.
*   **Protección**: Se aplican límites de velocidad (Rate Limiting) por IP para evitar el spam de pedidos y el abuso de las APIs de mapas.
*   **Aislamiento**: El sistema detecta el `slug` de la empresa mediante subdominios o rutas, asegurando que los datos y el branding permanezcan aislados entre inquilinos.

---
TaxiChat v2.0 - 2026.