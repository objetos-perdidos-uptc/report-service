# report-service

Microservicio de reportes de objetos perdidos y encontrados (Persona 2).

- **Lenguaje:** Node.js 22 + Express
- **Arquitectura:** Hexagonal (puertos y adaptadores) + DDD, con eventos de dominio listos para EDA
- **Persistencia:** PostgreSQL con ORM Sequelize y patrón DTO (`src/application/dto`)
- **Puerto:** 8082
- **Nombre en Eureka:** `REPORT-SERVICE`
- **Swagger:** http://localhost:8082/docs (JSON en `/openapi.json`)

## Arquitectura

Las dependencias apuntan siempre hacia adentro: la infraestructura conoce a la aplicación y al
dominio, pero el dominio no conoce Express, Sequelize, Eureka ni ningún framework.

```
src/
  domain/                     NÚCLEO: reglas de negocio puras, sin frameworks
    report.js                 agregado Report (crear, editar, cerrar, expirar, renovar, fotos)
    photo.js                  entidad Photo (parte del agregado)
    value-objects.js          ReportType, ReportStatus, CloseReason, Location, PrivateFeature, ExpirationPolicy
    events.js                 eventos de dominio (report.created, report.closed, ...)
    ports.js                  puertos de salida: ReportRepository, EventPublisher, PhotoStorage
    errors.js                 errores de dominio (validación, regla de negocio, no encontrado, prohibido)
  application/                CASOS DE USO: orquestan el dominio usando solo los puertos
    use-cases/                comandos: create, update, close, renew, fotos, cambiar estado, expirar, verificar
    queries/                  consultas: feed, búsqueda, historial, detalle, por expirar, estadísticas
    dto/                      request -> comando y agregado -> respuesta (público / interno)
  infrastructure/             ADAPTADORES: la tecnología concreta
    http/                     entrada REST (Express): rutas, controladores, middlewares, Swagger
    persistence/              salida: repositorio Sequelize + PostgreSQL (implementa ReportRepository)
    messaging/                salida: publicador de eventos en memoria (implementa EventPublisher)
    storage/                  salida: fotos en disco (implementa PhotoStorage)
    discovery/                Eureka y cliente HTTP de matching-service
    scheduling/               entrada programada: cron de expiración
    config.js                 variables de entorno
  container.js                raíz de composición: decide qué adaptador implementa cada puerto
  index.js                    arranque
tests/
  domain/                     reglas del agregado, sin base de datos
  application/                DTOs
  infrastructure/             API HTTP completa con un repositorio en memoria
  support/                    adaptador en memoria (implementa el mismo puerto que Sequelize)
```

Flujo de un comando: `HTTP -> controlador -> DTO -> caso de uso -> agregado Report -> repositorio
(guardar) -> EventPublisher (publicar eventos)`.

Hoy los eventos se reparten dentro del proceso: se registran en el log y un puente llama por HTTP a
matching-service. El siguiente paso es un adaptador de RabbitMQ/Kafka que implemente el mismo
puerto `EventPublisher`; solo cambia `container.js`.

## Configuración

Copiar `.env.example` a `.env` y ajustar. Usa los mismos nombres de variables que `auth-service`.

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `8082` | Puerto HTTP |
| `HOST_NAME` / `IP_ADDR` | `localhost` / `127.0.0.1` | Con qué host se registra en Eureka (en Docker: `report-service`) |
| `EUREKA_URL` | `http://localhost:8761/eureka/` | Servidor Eureka |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | PostgreSQL |
| `DB_NAME` | `reports_db` | Base propia del servicio. Se crea sola si no existe |
| `DB_USER` / `DB_PASSWORD` | `postgres` / *(vacío)* | Credenciales |
| `UPLOAD_DIR` | `uploads` | Carpeta de fotos (en Docker, montar un volumen en `/app/uploads`) |
| `MAX_PHOTOS` / `MAX_PHOTO_MB` | `5` / `5` | Límites de fotos por reporte |
| `EXPIRATION_DAYS` | `30` | Días sin actividad para expirar (HU-16) |
| `REMINDER_DAYS` | `3` | Anticipación del recordatorio (HU-25) |
| `EXPIRATION_CRON` | `0 2 * * *` | Cuándo corre el cron de expiración |

Las tablas (`reports`, `report_photos`, `categories`) las crea el ORM al arrancar, y las categorías
base se cargan la primera vez.

## Ejecución

```bash
npm install
npm start        # o: npm run dev (reinicia al guardar)
npm test
```

Con Docker:

```bash
docker build -t report-service .
docker run -p 8082:8082 --env-file .env -v report_uploads:/app/uploads report-service
```

## Autenticación

El servicio no valida el JWT: lo hace el API Gateway, que reenvía `X-User-Id`, `X-User-Email`,
`X-User-Role` y `X-User-CampusId`. El dueño y el campus de un reporte salen siempre de esas
cabeceras, nunca del body. Para probar directo en Swagger, llenarlas con el botón **Authorize**.

## Endpoints públicos (vía API Gateway, `/reports/**`)

| Funcionalidad | Request Mapping | Método HTTP | Parámetro / Tipo de dato | Retorno |
|---|---|---|---|---|
| Registrar objeto perdido o encontrado (HU-03, HU-04) | `/reports` | POST | Body JSON `CreateReportRequest`: `type` (String LOST/FOUND), `name` (String), `categoryId` (int), `description`, `color`, `material` (String), `location` {`latitude`, `longitude` (double), `textDirection` (String)}, `privateFeature` (String), `dateLost` / `dateOfDiscovery` (fecha ISO), `reward` (double), `custodyLocation` (String) | JSON `Report` |
| Feed del campus (HU-05) | `/reports/feed` | GET | Query: `type` (String), `categoryId` (int), `q` (String), `page` (int), `size` (int) | JSON página de `Report` |
| Búsqueda por palabra clave (HU-22) | `/reports/search` | GET | Query: `q` (String, obligatorio), `type`, `categoryId`, `page`, `size` | JSON página de `Report` |
| Historial de mis reportes (HU-23) | `/reports/me` | GET | Query: `status` (String ACTIVE/CLOSED/EXPIRED), `type` (String) | JSON lista de `Report` |
| Categorías | `/reports/categories` | GET | — | JSON lista de `Category` |
| Detalle de un reporte | `/reports/{id}` | GET | Path: `id` (int) | JSON `Report` |
| Actualizar reporte propio (HU-06) | `/reports/{id}` | PUT | Path: `id` (int). Body JSON `UpdateReportRequest` (los mismos campos de creación, todos opcionales, sin `type`) | JSON `Report` |
| Cerrar reporte propio (HU-06) | `/reports/{id}/close` | PATCH | Path: `id` (int). Body JSON opcional: `reason` (String RECOVERED_OTHER_MEANS/CANCELLED) | JSON `Report` |
| Renovar reporte (HU-25) | `/reports/{id}/renew` | PATCH | Path: `id` (int) | JSON `Report` |
| Adjuntar fotos (HU-04) | `/reports/{id}/photos` | POST | Path: `id` (int). `multipart/form-data`: `photos` (archivos de imagen, máx. 5) | JSON `Report` |
| Eliminar foto | `/reports/{id}/photos/{photoId}` | DELETE | Path: `id` (int), `photoId` (int) | 204 sin contenido |
| Ver foto | `/reports/photos/{filename}` | GET | Path: `filename` (String) | Imagen |

La característica privada (`privateFeature`) solo aparece en la respuesta cuando el reporte es del
usuario que consulta; en el feed nunca se expone (HU-03).

## Endpoints internos (`/internal/**`)

No pasan por el Gateway. Los otros microservicios los consumen resolviendo `REPORT-SERVICE` en
Eureka, p. ej. `http://report-service:8082/internal/reports/1`.

| Funcionalidad | Request Mapping | Método HTTP | Parámetro / Tipo de dato | Retorno | Lo usa |
|---|---|---|---|---|---|
| Listar reportes para comparar | `/internal/reports` | GET | Query: `type`, `status` (String, por defecto ACTIVE), `campusId`, `categoryId`, `userId` (int) | JSON lista de `InternalReport` | matching-service |
| Detalle con dueño | `/internal/reports/{id}` | GET | Path: `id` (int) | JSON `InternalReport` | matching, claim, notification |
| Validar característica privada (HU-12) | `/internal/reports/{id}/verify-private-feature` | POST | Body JSON: `privateFeature` (String) | JSON `{reportId, hasPrivateFeature, matches}` | claim-service |
| Cambiar estado (HU-14) | `/internal/reports/{id}/status` | PATCH | Body JSON: `status` (String), `reason` (String, por defecto RECOVERED al cerrar) | JSON `InternalReport` | claim-service |
| Reportes por expirar (HU-25) | `/internal/reports/expiring` | GET | Query: `days` (int, por defecto 3) | JSON lista de `InternalReport` | notification-service |
| Estadísticas de recuperación (HU-18, HU-19) | `/internal/reports/stats` | GET | — | JSON `ReportStats` | métricas |

`InternalReport` usa los mismos nombres de campo que el `ReportDTO` de matching-service
(`reportId`, `type`, `name`, `color`, `material`, `categoryId`, `campusId`, `location`, `photos`,
`creationDate`, `dateLost`, `reward`, `dateOfDiscovery`, `custodyLocation`) más `userId`, `status` y
fechas del ciclo de vida. Nunca incluye la característica privada.

## Integración con matching-service

Al crear, editar o renovar un reporte se llama a `POST /matching/evaluate/{reportId}`, y al cerrarlo
o expirarlo a `DELETE /matching/report/{reportId}`. Son llamadas "best effort": si matching-service
no está registrado en Eureka, el reporte se guarda igual y solo queda un aviso en el log.

## Expiración (HU-16)

Un cron (`EXPIRATION_CRON`, por defecto todos los días a las 2:00) pasa a `EXPIRED` los reportes
`ACTIVE` con más de `EXPIRATION_DAYS` días sin actividad. También corre una vez al arrancar. Editar
o renovar un reporte reinicia el conteo.
