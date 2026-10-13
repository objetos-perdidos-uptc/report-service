import multer from 'multer'

const TITLES = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict' }

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail)
    this.status = status
  }
}

/** Envuelve un handler async para que sus errores lleguen al errorHandler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function notFound(req, res, next) {
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.path}`))
}

// Mismo formato (ProblemDetail) que devuelven los servicios en Spring: el front lee "detail".
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = err.status || 500
  let detail = err.message

  if (err instanceof multer.MulterError) {
    status = 400
    detail = err.code === 'LIMIT_FILE_SIZE' ? 'La foto supera el tamaño máximo permitido' : `Error al subir fotos: ${err.message}`
  } else if (err.type === 'entity.parse.failed') {
    status = 400
    detail = 'JSON inválido'
  }

  if (status >= 500) {
    console.error(err)
    detail = 'Error interno del servidor'
  }
  res.status(status).json({ type: 'about:blank', title: TITLES[status] || 'Error', status, detail })
}
