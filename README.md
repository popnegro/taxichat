# TaxiChat - SaaS de Marca Blanca para Gestión de Taxis

TaxiChat es una solución integral de transporte tipo "White-Label" diseñada para permitir que múltiples agencias de taxis operen bajo su propia identidad visual, utilizando una infraestructura compartida, segura y escalable.

## 🚀 Arquitectura del Proyecto

El sistema utiliza un stack moderno basado en **Node.js (Express)**, **MongoDB**, **Supabase** para mensajería en tiempo real y **Mercado Pago** para la gestión de pagos. Está optimizado para ser desplegado en **Vercel**.

## 📁 Funciones de los Archivos

### 🛠️ Backend (Núcleo)

*   **`/api/index.js`**: El punto de entrada principal. Configura el servidor Express, gestiona la conexión a MongoDB, aplica políticas de *Rate Limiting*, define los endpoints de la API (configuración, pedidos, confirmaciones) y maneja los Webhooks de Mercado Pago.
*   **`vercel.json`**: Configuración de despliegue para Vercel, gestionando el ruteo de funciones serverless y archivos estáticos.
*   **`.env`**: Archivo de configuración para variables de entorno (Credenciales de DB, Supabase, API Keys).

### 🗄️ Modelos (Base de Datos)

*   **`/models/Empresa.js`**: Esquema de Mongoose que define a los inquilinos (tenants). Almacena el `slug`, colores de marca, logo y tokens específicos de Mercado Pago.
*   **`/models/Viaje.js`**: Esquema de Mongoose para los pedidos. Registra el estado del viaje, geolocalización, precio, datos del pasajero y chofer asignado.

### 💻 Frontend: Paneles de Operación

*   **`/public/console.html`**: **Panel del SuperAdministrador**. Permite monitorear el flujo global de pedidos de todas las empresas registradas en la plataforma a través de un canal de broadcast global.
*   **`/public/empresa_console.html`**: **Panel del Operador de Agencia**. Filtrado por el `slug` de la empresa. Aquí se reciben los pedidos locales, se asignan móviles y se gestiona el despacho en tiempo real con alertas sonoras.

### 📱 Frontend: Experiencia del Cliente

*   **`/public/reserva.html`**: **Layout Maestro de Reserva**. Una landing page completa que integra el formulario inteligente con secciones de beneficios, seguridad y FAQ. Soporta carga dinámica de marca blanca y skeleton screens.
*   **`/public/client.html`**: **Formulario Inteligente Autónomo**. Versión simplificada del proceso de reserva con geolocalización automática, autocompletado de direcciones y recibo de pago dinámico.
*   **`/public/index.html` / `/public/empresa.html`**: Páginas de marketing y aterrizaje que describen los beneficios del servicio para pasajeros y dueños de flotas.

## 🛠️ Tecnologías Utilizadas

*   **Backend**: Node.js, Express, Mongoose.
*   **Frontend**: Tailwind CSS, Supabase JS SDK (Realtime), Google Maps API.
*   **Pagos**: Mercado Pago SDK.
*   **Seguridad**: Joi (Validación de esquemas), Express Rate Limit.

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
    BASE_URL=http://localhost:3000
    ```

3.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```

## 🛡️ Flujo de Seguridad

*   **Validación**: Cada pedido es validado mediante esquemas de Joi antes de ingresar a la base de datos.
*   **Protección**: Se aplican límites de velocidad (Rate Limiting) por IP para evitar el spam de pedidos y el abuso de las APIs de mapas.
*   **Confirmación**: El despacho de móviles requiere un `operadorToken` secreto que es validado en el servidor antes de notificar al cliente.

---
Desarrollado como un PMV robusto para el mercado de transporte 2026.