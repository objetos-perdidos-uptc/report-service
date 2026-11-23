# Manual de report-service

Sección del manual de usuario, instalación y configuración correspondiente al microservicio de
reportes (Persona 2). Los detalles técnicos completos están en el [README](../README.md).

---

## 1. Qué hace el servicio

Gestiona los reportes de objetos **perdidos** y **encontrados** de cada sede universitaria:

| Funcionalidad | Historia de usuario |
|---|---|
| Registrar un objeto perdido (con característica privada) | HU-03 |
| Registrar un objeto encontrado (con fotos) | HU-04 |
| Consultar el feed de la sede | HU-05 |
| Editar o cerrar un reporte propio | HU-06 |
| Validar la característica privada de quien reclama | HU-12 |
| Cerrar el reporte cuando se entrega el objeto | HU-14 |
| Expiración automática a los 30 días sin actividad | HU-16 |
| Datos para la tasa y el tiempo de recuperación | HU-18, HU-19 |
| Búsqueda por palabra clave | HU-22 |
| Historial de reportes propios | HU-23 |
| Recordatorio y renovación antes de expirar | HU-25 |

---

## 2. Manual de usuario (frontend → pestaña **Feed**)

1. **Iniciar sesión.** El feed solo muestra reportes de la sede asociada al usuario.
2. **Feed de mi sede.** Lista los reportes activos. Se puede filtrar por tipo (perdidos/encontrados),
   por categoría y buscar por palabra clave (nombre, color, material, lugar...).
3. **+ Nuevo reporte.**
   - Elegir *Perdí un objeto* o *Encontré un objeto* y la categoría.
   - Escribir el nombre, detalles visibles, color, material, fecha y lugar. *Usar mi ubicación actual*
     guarda las coordenadas, que ayudan a calcular coincidencias.
   - **Característica privada:** un detalle que solo el dueño conoce (obligatoria si se perdió el
     objeto). Nunca se publica; sirve para comprobar quién es el dueño al reclamar.
   - Adjuntar hasta 5 fotos y pulsar *Publicar reporte*.
4. **Mis reportes.** Historial con el estado de cada reporte (Activo, Cerrado o Expirado) y su fecha
   de expiración.
   - *Renovar*: el reporte vuelve a contar 30 días (también recupera uno expirado).
   - *Ya lo recuperé / cerrar*: lo saca del feed.
5. Si un reclamo sobre el objeto es aprobado, el reporte se cierra solo.

---

## 3. Instalación

### Con Docker (recomendado, sistema completo)

El servicio forma parte del `docker-compose` del repositorio `infra`:

```bash
git clone https://github.com/objetos-perdidos-uptc/infra.git
cd infra
./lost.sh start
```

`lost.sh` clona `report-service`, construye su imagen (`Dockerfile`, Node.js 22) y lo levanta junto con
PostgreSQL, RabbitMQ, Eureka y el API Gateway.

### Solo este servicio (desarrollo)

Requisitos: Node.js 22, PostgreSQL y, opcionalmente, RabbitMQ.

```bash
cd report-service
cp .env.example .env      # ajustar DB_PASSWORD y RABBITMQ_URL
npm install
npm start
```

---

## 4. Configuración

### Base de datos (PostgreSQL)

- Base propia: `reports_db`. **Se crea sola** al arrancar si no existe.
- Las tablas (`reports`, `report_photos`, `categories`) las crea el ORM (Sequelize). Las columnas nuevas
  se agregan con una migración automática, sin perder datos.
- Las categorías base (Electrónicos, Documentos, Llaves...) se cargan la primera vez.

### Variables de entorno principales

| Variable | Valor en Docker | Para qué |
|---|---|---|
| `DB_HOST`, `DB_USER`, `DB_PASSWORD` | `postgres` y credenciales del `.env` | Conexión a PostgreSQL |
| `EUREKA_URL` | `http://eureka:8761/eureka/` | Registro como `REPORT-SERVICE` |
| `RABBITMQ_URL` | `amqp://usuario:clave@rabbitmq:5672` | Event bus (EDA) |
| `EXPIRATION_DAYS` / `REMINDER_DAYS` | `30` / `3` | Expiración y recordatorio |
| `UPLOAD_DIR` | `uploads` (volumen `report_uploads`) | Fotos |

### API Gateway y seguridad

El Gateway enruta `/reports/**` a `lb://REPORT-SERVICE`, valida el token JWT y reenvía al servicio
las cabeceras `X-User-Id`, `X-User-Role` y `X-User-CampusId`. Las rutas `/internal/**` no se exponen
en el Gateway: solo las usan los otros microservicios dentro de la red de Docker.

### Event bus (RabbitMQ)

| Dirección | Exchange (topic) | Routing keys |
|---|---|---|
| Publica | `reports.events` | `report.created`, `report.updated`, `report.photos-changed`, `report.renewed`, `report.closed`, `report.expired`, `report.expiring-soon` |
| Escucha (cola `report-service.claim-events`) | `claims.events` | `claim.approved`, `claim.delivered` → cierra el reporte |

En el panel de RabbitMQ (http://localhost:15672) se ven el exchange `reports.events` y la cola
`report-service.claim-events`.

### Monitoreo (Prometheus)

`http://localhost:8082/metrics` expone peticiones HTTP, tiempos de respuesta, eventos de negocio
(`report_domain_events_total`), reportes por estado y estado de RabbitMQ. Job de Prometheus:

```yaml
- job_name: report-service
  static_configs:
    - targets: ['report-service:8082']
```

---

## 5. Documentación de la API (Swagger)

- Swagger UI: **http://localhost:8082/docs**
- Especificación OpenAPI: http://localhost:8082/openapi.json

Para probar los endpoints `/reports/**` directamente en Swagger, pulsar **Authorize** y llenar
`X-User-Id` (por ejemplo `1`) y `X-User-CampusId` (por ejemplo `1`), que en producción agrega el
Gateway a partir del token.

---

## 6. Arquitectura (para la sustentación)

Hexagonal + DDD + EDA. Las dependencias apuntan hacia el dominio:

```
infraestructura (Express, Sequelize, RabbitMQ, Eureka, cron, Prometheus)
        │ implementa puertos / invoca casos de uso
        ▼
aplicación (casos de uso, consultas, DTOs)
        │ usa
        ▼
dominio (agregado Report, value objects, eventos de dominio, puertos)
```

| Carpeta | Tipo de código |
|---|---|
| `src/domain/report.js` | Agregado (entidad raíz) con las reglas de negocio |
| `src/domain/value-objects.js` | Value objects: `Location`, `PrivateFeature`, `ReportStatus`, `ExpirationPolicy`... |
| `src/domain/events.js` | Eventos de dominio |
| `src/domain/ports.js` | Puertos de salida: `ReportRepository`, `EventPublisher`, `PhotoStorage` |
| `src/application/use-cases/` | Casos de uso (comandos) |
| `src/application/queries/` | Consultas de solo lectura |
| `src/application/dto/` | DTOs de entrada y salida |
| `src/infrastructure/http/` | Controllers, routes, middlewares y Swagger (adaptador de entrada) |
| `src/infrastructure/persistence/` | Repositorio Sequelize + PostgreSQL (adaptador de salida) |
| `src/infrastructure/messaging/` | Publicador y consumidor de RabbitMQ (adaptadores EDA) |
| `src/infrastructure/monitoring/` | Métricas de Prometheus |
| `src/infrastructure/config.js` | Configuración |
| `src/container.js` | Raíz de composición: conecta cada puerto con su adaptador |

Pruebas: `npm test` (17 pruebas: dominio, DTOs, API HTTP completa con un repositorio en memoria y
consumidor de eventos).
