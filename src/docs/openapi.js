// Especificación OpenAPI que sirve Swagger UI en /docs.
import { config } from '../config.js'

const ref = (name) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema) => ({ content: { 'application/json': { schema } } })
const ok = (description, schema) => ({ description, ...(schema ? json(schema) : {}) })
const problem = (description) => ({ description, ...json(ref('ProblemDetail')) })
const query = (name, schema, description) => ({ name, in: 'query', schema, description })
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID del reporte' }

// Cabeceras que agrega el API Gateway tras validar el JWT. En Swagger se llenan a mano con "Authorize".
const gateway = [{ userId: [], userCampusId: [], userRole: [] }]

const typeEnum = { type: 'string', enum: ['LOST', 'FOUND'] }
const statusEnum = { type: 'string', enum: ['ACTIVE', 'CLOSED', 'EXPIRED'] }
const dateTime = { type: 'string', format: 'date-time', nullable: true }
const text = { type: 'string', nullable: true }

const reportFields = {
  reportId: { type: 'integer', example: 1 },
  type: typeEnum,
  status: statusEnum,
  name: { type: 'string', example: 'Mochila azul' },
  description: text,
  color: { ...text, example: 'azul' },
  material: { ...text, example: 'nylon' },
  categoryId: { type: 'integer', example: 5 },
  campusId: { type: 'integer', example: 1 },
  location: { ...ref('Location'), nullable: true },
  photos: { type: 'array', items: { type: 'string' }, example: ['/reports/photos/3f0c.jpg'] },
  creationDate: dateTime,
  dateLost: dateTime,
  reward: { type: 'number', nullable: true },
  dateOfDiscovery: dateTime,
  custodyLocation: text,
  lastActivityDate: dateTime,
  expirationDate: dateTime,
  closedAt: dateTime,
  closeReason: text,
}

const editableFields = {
  name: { type: 'string', maxLength: 120, example: 'Mochila azul' },
  description: { type: 'string', example: 'Mochila con un llavero de la UPTC' },
  color: { type: 'string', example: 'azul' },
  material: { type: 'string', example: 'nylon' },
  categoryId: { type: 'integer', example: 5 },
  location: ref('Location'),
  privateFeature: {
    type: 'string',
    description: 'Característica privada. Obligatoria en LOST. Nunca se publica.',
    example: 'Tiene mi nombre bordado por dentro',
  },
  dateLost: { type: 'string', format: 'date-time', description: 'Obligatoria en LOST' },
  reward: { type: 'number', description: 'Solo LOST', example: 20000 },
  dateOfDiscovery: { type: 'string', format: 'date-time', description: 'Obligatoria en FOUND' },
  custodyLocation: { type: 'string', description: 'Solo FOUND', example: 'Portería principal' },
}

const feedParams = [
  query('type', typeEnum, 'Filtrar por tipo'),
  query('categoryId', { type: 'integer' }, 'Filtrar por categoría'),
  query('page', { type: 'integer', default: 0 }, 'Página (desde 0)'),
  query('size', { type: 'integer', default: 20, maximum: 50 }, 'Tamaño de página'),
  query('campusId', { type: 'integer' }, 'Solo ADMIN: consultar otro campus'),
]

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Report Service',
    version: '0.1.0',
    description:
      'Reportes de objetos perdidos y encontrados: registro, fotos, feed por campus, búsqueda, ' +
      'historial y expiración automática.\n\n' +
      'Las rutas `/reports/**` se consumen a través del API Gateway, que valida el JWT y agrega las ' +
      'cabeceras `X-User-*`. Las rutas `/internal/**` no pasan por el Gateway: las usan los otros ' +
      'microservicios resolviendo `REPORT-SERVICE` en Eureka.',
  },
  servers: [{ url: `http://localhost:${config.port}`, description: 'Directo al servicio' }],
  tags: [
    { name: 'reports', description: 'Endpoints públicos (vía API Gateway)' },
    { name: 'photos', description: 'Gestión de fotos' },
    { name: 'internal', description: 'Endpoints para otros microservicios' },
    { name: 'infra' },
  ],
  paths: {
    '/reports': {
      post: {
        tags: ['reports'],
        summary: 'Registrar un objeto perdido o encontrado (HU-03, HU-04)',
        security: gateway,
        requestBody: { required: true, ...json(ref('CreateReportRequest')) },
        responses: { 201: ok('Reporte creado', ref('Report')), 400: problem('Datos inválidos') },
      },
    },
    '/reports/feed': {
      get: {
        tags: ['reports'],
        summary: 'Feed de reportes activos del campus del usuario (HU-05)',
        security: gateway,
        parameters: [query('q', { type: 'string' }, 'Palabra clave (opcional)'), ...feedParams],
        responses: { 200: ok('Página de reportes', ref('ReportPage')) },
      },
    },
    '/reports/search': {
      get: {
        tags: ['reports'],
        summary: 'Buscar por palabra clave dentro del feed del campus (HU-22)',
        security: gateway,
        parameters: [{ ...query('q', { type: 'string' }, 'Palabra clave'), required: true }, ...feedParams],
        responses: { 200: ok('Página de reportes', ref('ReportPage')), 400: problem('Falta q') },
      },
    },
    '/reports/me': {
      get: {
        tags: ['reports'],
        summary: 'Historial de mis reportes: activos, cerrados y expirados (HU-23)',
        security: gateway,
        parameters: [query('status', statusEnum, 'Filtrar por estado'), query('type', typeEnum, 'Filtrar por tipo')],
        responses: { 200: ok('Lista de reportes', { type: 'array', items: ref('Report') }) },
      },
    },
    '/reports/categories': {
      get: {
        tags: ['reports'],
        summary: 'Categorías de objetos',
        security: gateway,
        responses: { 200: ok('Lista de categorías', { type: 'array', items: ref('Category') }) },
      },
    },
    '/reports/{id}': {
      get: {
        tags: ['reports'],
        summary: 'Detalle de un reporte',
        security: gateway,
        parameters: [idParam],
        responses: { 200: ok('Reporte', ref('Report')), 404: problem('No existe') },
      },
      put: {
        tags: ['reports'],
        summary: 'Actualizar un reporte propio (HU-06)',
        security: gateway,
        parameters: [idParam],
        requestBody: { required: true, ...json(ref('UpdateReportRequest')) },
        responses: {
          200: ok('Reporte actualizado', ref('Report')),
          400: problem('Datos inválidos o reporte no activo'),
          403: problem('No es tu reporte'),
        },
      },
    },
    '/reports/{id}/close': {
      patch: {
        tags: ['reports'],
        summary: 'Cerrar un reporte propio (HU-06)',
        security: gateway,
        parameters: [idParam],
        requestBody: json({
          type: 'object',
          properties: {
            reason: { type: 'string', enum: ['RECOVERED_OTHER_MEANS', 'CANCELLED'], default: 'RECOVERED_OTHER_MEANS' },
          },
        }),
        responses: { 200: ok('Reporte cerrado', ref('Report')), 403: problem('No es tu reporte') },
      },
    },
    '/reports/{id}/renew': {
      patch: {
        tags: ['reports'],
        summary: 'Renovar un reporte activo o expirado (HU-25)',
        security: gateway,
        parameters: [idParam],
        responses: { 200: ok('Reporte renovado', ref('Report')), 400: problem('El reporte está cerrado') },
      },
    },
    '/reports/{id}/photos': {
      post: {
        tags: ['photos'],
        summary: `Adjuntar fotos a un reporte propio, máximo ${config.maxPhotos} (HU-04)`,
        security: gateway,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['photos'],
                properties: { photos: { type: 'array', items: { type: 'string', format: 'binary' } } },
              },
            },
          },
        },
        responses: { 201: ok('Reporte con sus fotos', ref('Report')), 400: problem('Archivo inválido') },
      },
    },
    '/reports/{id}/photos/{photoId}': {
      delete: {
        tags: ['photos'],
        summary: 'Eliminar una foto de un reporte propio',
        security: gateway,
        parameters: [idParam, { name: 'photoId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 204: ok('Foto eliminada'), 404: problem('No existe') },
      },
    },
    '/reports/photos/{filename}': {
      get: {
        tags: ['photos'],
        summary: 'Descargar una foto',
        security: gateway,
        parameters: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Imagen', content: { 'image/*': { schema: { type: 'string', format: 'binary' } } } },
          404: problem('No existe'),
        },
      },
    },

    '/internal/reports': {
      get: {
        tags: ['internal'],
        summary: 'Listar reportes para calcular coincidencias (matching-service)',
        parameters: [
          query('type', typeEnum),
          query('status', { ...statusEnum, default: 'ACTIVE' }),
          query('campusId', { type: 'integer' }),
          query('categoryId', { type: 'integer' }),
          query('userId', { type: 'integer' }),
        ],
        responses: { 200: ok('Lista de reportes', { type: 'array', items: ref('InternalReport') }) },
      },
    },
    '/internal/reports/{id}': {
      get: {
        tags: ['internal'],
        summary: 'Reporte completo, incluido el dueño (sin la característica privada)',
        parameters: [idParam],
        responses: { 200: ok('Reporte', ref('InternalReport')), 404: problem('No existe') },
      },
    },
    '/internal/reports/{id}/verify-private-feature': {
      post: {
        tags: ['internal'],
        summary: 'Validar la característica privada de un reclamante (claim-service, HU-12)',
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['privateFeature'],
            properties: { privateFeature: { type: 'string', example: 'tiene mi nombre bordado por dentro' } },
          }),
        },
        responses: {
          200: ok('Resultado', {
            type: 'object',
            properties: {
              reportId: { type: 'integer' },
              hasPrivateFeature: { type: 'boolean' },
              matches: { type: 'boolean' },
            },
          }),
        },
      },
    },
    '/internal/reports/{id}/status': {
      patch: {
        tags: ['internal'],
        summary: 'Cambiar el estado de un reporte, p. ej. al confirmar la entrega (claim-service, HU-14)',
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['status'],
            properties: { status: statusEnum, reason: { type: 'string', example: 'RECOVERED' } },
          }),
        },
        responses: { 200: ok('Reporte actualizado', ref('InternalReport')) },
      },
    },
    '/internal/reports/expiring': {
      get: {
        tags: ['internal'],
        summary: 'Reportes que están por expirar (notification-service, HU-25)',
        parameters: [query('days', { type: 'integer', default: config.reminderDays }, 'Días que faltan para expirar')],
        responses: { 200: ok('Lista de reportes', { type: 'array', items: ref('InternalReport') }) },
      },
    },
    '/internal/reports/stats': {
      get: {
        tags: ['internal'],
        summary: 'Tasa de recuperación por campus y tiempo promedio (métricas, HU-18 y HU-19)',
        responses: { 200: ok('Estadísticas', ref('ReportStats')) },
      },
    },

    '/health': {
      get: { tags: ['infra'], summary: 'Estado del servicio (lo consulta Eureka)', responses: { 200: ok('UP') } },
    },
  },
  components: {
    securitySchemes: {
      userId: { type: 'apiKey', in: 'header', name: 'X-User-Id' },
      userCampusId: { type: 'apiKey', in: 'header', name: 'X-User-CampusId' },
      userRole: { type: 'apiKey', in: 'header', name: 'X-User-Role' },
    },
    schemas: {
      Location: {
        type: 'object',
        properties: {
          latitude: { type: 'number', example: 5.5528 },
          longitude: { type: 'number', example: -73.3575 },
          textDirection: { type: 'string', example: 'Biblioteca central, segundo piso' },
        },
      },
      Category: {
        type: 'object',
        properties: { categoryId: { type: 'integer' }, name: { type: 'string' } },
      },
      CreateReportRequest: {
        type: 'object',
        required: ['type', 'name', 'categoryId'],
        properties: { type: typeEnum, ...editableFields },
      },
      UpdateReportRequest: {
        type: 'object',
        description: 'Solo se actualizan los campos enviados. El tipo y el campus no se pueden cambiar.',
        properties: editableFields,
      },
      Report: {
        type: 'object',
        properties: {
          ...reportFields,
          categoryName: text,
          isOwner: { type: 'boolean' },
          privateFeature: { ...text, description: 'Solo aparece si el reporte es del usuario' },
        },
      },
      InternalReport: {
        type: 'object',
        properties: { ...reportFields, userId: { type: 'integer' } },
      },
      ReportPage: {
        type: 'object',
        properties: {
          content: { type: 'array', items: ref('Report') },
          page: { type: 'integer' },
          size: { type: 'integer' },
          totalElements: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      ReportStats: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          active: { type: 'integer' },
          closed: { type: 'integer' },
          expired: { type: 'integer' },
          recovered: { type: 'integer' },
          recoveryRate: { type: 'number', description: 'Porcentaje de reportes recuperados' },
          avgRecoveryHours: { type: 'number' },
          byCampus: { type: 'array', items: { type: 'object' } },
        },
      },
      ProblemDetail: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
        },
      },
    },
  },
}
