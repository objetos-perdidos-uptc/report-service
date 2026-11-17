import { HttpError } from './error.js'

const toInt = (v) => {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

/**
 * El API Gateway ya validó el JWT y reenvía los datos del usuario en cabeceras X-User-*.
 * Aquí solo se leen y se dejan en req.user.
 */
export function gatewayUser(req, res, next) {
  const id = req.get('X-User-Id')
  if (!id || id === 'null') return next(new HttpError(401, 'Falta la cabecera X-User-Id (la agrega el API Gateway)'))

  req.user = {
    id,
    email: req.get('X-User-Email') || null,
    role: (req.get('X-User-Role') || 'STUDENT').toUpperCase(),
    campusId: toInt(req.get('X-User-CampusId')),
  }
  next()
}
