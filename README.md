# TaxiChat - SaaS de Marca Blanca para Gestión de Taxis

TaxiChat es una plataforma SaaS de transporte tipo "White-Label" de grado industrial. Permite que múltiples agencias de taxis operen de forma aislada bajo su propia identidad visual, utilizando una infraestructura Serverless unificada, segura y optimizada para SEO.

## 🚀 Arquitectura del Proyecto

El sistema utiliza un stack de alto rendimiento: **Node.js (Express)**, **MongoDB Atlas**, **Supabase (Realtime Broadcast)** para baja latencia y **Mercado Pago API**. La arquitectura es 100% *Serverless* y gestiona dinámicamente inquilinos (tenants) mediante subdominios o rutas.

## 📁 Funciones de los Archivos

### 🛠️ Backend (Núcleo)

*   **`/api/index.js`**: Motor principal. Implementa seguridad JWT con Refresh Tokens en cookies HttpOnly, validación Joi, motor de plantillas HTML dinámicas para SEO, importador de Excel/CSV y Webhooks.
*   **`vercel.json`**: Define los *rewrites* para manejar URLs amigables y la inyección de lógica de servidor en archivos estáticos.
*   **`.env`**: Archivo de configuración para variables de entorno (Credenciales de DB, Supabase, API Keys).

### 🗄️ Modelos (Base de Datos)

*   **`/models/Empresa.js`**: Esquema de Mongoose que define a los inquilinos (tenants). Almacena el `slug`, colores de marca, logo y tokens específicos de Mercado Pago.
*   **`/models/Chofer.js`**: Gestión de flota por empresa. Soporta carga masiva y vinculación con pedidos.
*   **`/models/Viaje.js`**: Registro de pedidos. Incluye trazabilidad de estados, calificación de usuario (estrellas) y vinculación con transacciones de Mercado Pago.

### 💻 Frontend: Paneles de Operación

*   **`/public/console.html`**: **Centro de Control Global**. Gestión de inquilinos, editor SEO con parser JSON-LD y herramientas de carga masiva de datos (Excel/CSV).
*   **`/public/empresa_console.html`**: **Consola Operativa de Agencia**. Despacho en tiempo real, alertas sonoras y gestión de sesiones persistentes.

### 📱 Frontend: Experiencia del Cliente

*   **`/public/reserva.html`**: **Landing Page Maestra**. Layout dinámico que adapta el SEO y el branding al vuelo. Incluye componentes de confianza y estados de carga (Skeletons).
*   **`/public/client.html`**: **App Web de Pasajero**. Optimización máxima de UX para geolocalización, pago online y feedback.
*   **`/public/index.html` / `/public/empresa.html`**: Páginas de marketing y aterrizaje que describen los beneficios del servicio para pasajeros y dueños de flotas.

## 🛡️ Seguridad y SEO Avanzado

*   **Seguridad**: Implementación de **Cookies HttpOnly** para Refresh Tokens, mitigando ataques XSS. Rate Limiting por IP y validación estricta de esquemas.
*   **SEO**: Inyección de grafos **JSON-LD (@graph)** que conectan la Organización con el Servicio de Taxi y Breadcrumbs. Generación automática de `sitemap.xml` para indexación de subdominios.
*   **Data**: Motor de procesamiento de archivos Excel/CSV en memoria para gestión masiva de choferes y clientes en entornos Serverless.

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