// Reglas de negocio de los reportes.
import { matchingClient } from '../clients/matching.client.js'
import { config } from '../config.js'
import {
  fromCreateRequest, fromUpdateRequest, normalizeText, toInternalDTO, toPageDTO, toPublicDTO,
} from '../dto/report.dto.js'
import { HttpError } from '../middlewares/error.js'
import { removeFile } from '../middlewares/upload.js'
import { REPORT_STATUS, REPORT_TYPES } from '../models/index.js'
import { reportRepository as repo } from '../repositories/report.repository.js'

const DAY_MS = 86_400_000
const OWNER_CLOSE_REASONS = ['RECOVERED_OTHER_MEANS', 'CANCELLED']
const RECOVERED_REASONS = ['RECOVERED', 'RECOVERED_OTHER_MEANS']

function parseId(value, name = 'reportId') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} inválido`)
  return n
}

function parseEnum(value, allowed, name) {
  if (value === undefined || value === '') return undefined
  const v = String(value).toUpperCase()
  if (!allowed.includes(v)) throw new HttpError(400, `${name} debe ser uno de: ${allowed.join(', ')}`)
  return v
}

function parsePaging(query) {
  const page = Math.max(0, Number.parseInt(query.page, 10) || 0)
  const size = Math.min(50, Math.max(1, Number.parseInt(query.size, 10) || 20))
  return { page, size }
}

const optionalId = (value, name) => (value === undefined || value === '' ? undefined : parseId(value, name))

async function getReport(id) {
  const report = await repo.findById(parseId(id))
  if (!report) throw new HttpError(404, 'Reporte no encontrado')
  return report
}

async function getOwned(id, user) {
  const report = await getReport(id)
  if (String(report.userId) !== String(user.id)) throw new HttpError(403, 'No es tu reporte')
  return report
}

async function assertCategory(categoryId) {
  if (categoryId != null && !(await repo.categoryExists(categoryId))) {
    throw new HttpError(400, 'categoryId:la categoría no existe')
  }
}

/** Feed y búsqueda comparten filtros: siempre reportes ACTIVE del campus del usuario (HU-05). */
function feedFilters(query, user) {
  const campusId = user.role === 'ADMIN' && query.campusId ? parseId(query.campusId, 'campusId') : user.campusId
  if (campusId == null) throw new HttpError(400, 'Tu usuario no tiene un campus asociado')
  return {
    campusId,
    status: 'ACTIVE',
    type: parseEnum(query.type, REPORT_TYPES, 'type'),
    categoryId: optionalId(query.categoryId, 'categoryId'),
    q: String(query.q ?? '').trim().slice(0, 100) || undefined,
  }
}

async function setStatus(report, status, reason) {
  const leavesFeed = report.status === 'ACTIVE' && status !== 'ACTIVE'
  await report.update({
    status,
    closeReason: status === 'ACTIVE' ? null : reason,
    closedAt: status === 'ACTIVE' ? null : new Date(),
    ...(status === 'ACTIVE' ? { lastActivityDate: new Date() } : {}),
  })
  if (leavesFeed) matchingClient.cleanup(report.reportId)
  else if (status === 'ACTIVE') matchingClient.evaluate(report.reportId)
  return report
}

export const reportService = {
  // ---------- Público (vía API Gateway) ----------

  categories: () => repo.findCategories(),

  /** HU-03 / HU-04: registra un objeto perdido o encontrado. */
  async create(body, user) {
    const data = fromCreateRequest(body, user)
    await assertCategory(data.categoryId)
    const { reportId } = await repo.create(data)
    matchingClient.evaluate(reportId)
    return toPublicDTO(await repo.findById(reportId), user.id)
  },

  /** HU-05: feed del campus del usuario. */
  async feed(query, user) {
    const { page, size } = parsePaging(query)
    const result = await repo.findPage(feedFilters(query, user), page, size)
    return toPageDTO(result, page, size, (r) => toPublicDTO(r, user.id))
  },

  /** HU-22: búsqueda por palabra clave dentro del feed del campus. */
  async search(query, user) {
    if (!String(query.q ?? '').trim()) throw new HttpError(400, 'q:es obligatorio')
    return this.feed(query, user)
  },

  /** HU-23: historial de reportes propios (activos, cerrados y expirados). */
  async history(query, user) {
    const filters = {
      userId: user.id,
      status: parseEnum(query.status, REPORT_STATUS, 'status'),
      type: parseEnum(query.type, REPORT_TYPES, 'type'),
    }
    return (await repo.findAll(filters)).map((r) => toPublicDTO(r, user.id))
  },

  async detail(id, user) {
    return toPublicDTO(await getReport(id), user.id)
  },

  /** HU-06: actualiza un reporte propio. */
  async update(id, body, user) {
    const report = await getOwned(id, user)
    if (report.status !== 'ACTIVE') throw new HttpError(400, 'Solo se pueden editar reportes activos')
    const data = fromUpdateRequest(body, report.type)
    await assertCategory(data.categoryId)
    await report.update({ ...data, lastActivityDate: new Date() })
    matchingClient.evaluate(report.reportId)
    return toPublicDTO(await repo.findById(report.reportId), user.id)
  },

  /** HU-06: cierra un reporte propio (p. ej. el objeto se recuperó por otros medios). */
  async close(id, body, user) {
    const report = await getOwned(id, user)
    if (report.status !== 'ACTIVE') throw new HttpError(400, 'El reporte ya no está activo')
    const reason = parseEnum(body?.reason, OWNER_CLOSE_REASONS, 'reason') ?? 'RECOVERED_OTHER_MEANS'
    return toPublicDTO(await setStatus(report, 'CLOSED', reason), user.id)
  },

  /** HU-25: renueva un reporte activo o expirado para que no salga del feed. */
  async renew(id, user) {
    const report = await getOwned(id, user)
    if (report.status === 'CLOSED') throw new HttpError(400, 'Un reporte cerrado no se puede renovar')
    return toPublicDTO(await setStatus(report, 'ACTIVE'), user.id)
  },

  /** HU-04: adjunta fotos a un reporte propio. */
  async addPhotos(id, files, user) {
    try {
      const report = await getOwned(id, user)
      if (report.status !== 'ACTIVE') throw new HttpError(400, 'Solo se pueden agregar fotos a reportes activos')
      if (!files?.length) throw new HttpError(400, 'Envía al menos una imagen en el campo "photos"')
      if (report.photos.length + files.length > config.maxPhotos) {
        throw new HttpError(400, `Un reporte admite máximo ${config.maxPhotos} fotos`)
      }
      await repo.addPhotos(files.map((f) => ({
        reportId: report.reportId,
        filename: f.filename,
        url: `/reports/photos/${f.filename}`,
      })))
      return toPublicDTO(await repo.findById(report.reportId), user.id)
    } catch (e) {
      files?.forEach((f) => removeFile(f.filename))   // no dejar archivos huérfanos
      throw e
    }
  },

  async deletePhoto(id, photoId, user) {
    const report = await getOwned(id, user)
    const photo = await repo.findPhoto(report.reportId, parseId(photoId, 'photoId'))
    if (!photo) throw new HttpError(404, 'Foto no encontrada')
    await photo.destroy()
    removeFile(photo.filename)
  },

  // ---------- Interno (otros microservicios, por nombre en Eureka) ----------

  async internalDetail(id) {
    return toInternalDTO(await getReport(id))
  },

  /** Para matching-service: reportes contra los que comparar (por defecto, los ACTIVE). */
  async internalList(query) {
    const filters = {
      type: parseEnum(query.type, REPORT_TYPES, 'type'),
      status: parseEnum(query.status, REPORT_STATUS, 'status') ?? 'ACTIVE',
      campusId: optionalId(query.campusId, 'campusId'),
      categoryId: optionalId(query.categoryId, 'categoryId'),
      userId: optionalId(query.userId, 'userId'),
    }
    return (await repo.findAll(filters)).map(toInternalDTO)
  },

  /** Para claim-service (HU-12): valida la característica privada sin revelarla. */
  async verifyPrivateFeature(id, body) {
    const report = await getReport(id)
    const given = normalizeText(body?.privateFeature)
    if (!given) throw new HttpError(400, 'privateFeature:es obligatorio')
    const expected = normalizeText(report.privateFeature)
    return { reportId: report.reportId, hasPrivateFeature: !!expected, matches: !!expected && expected === given }
  },

  /** Para claim-service: cierra el reporte cuando la entrega se confirma con OTP (HU-14). */
  async internalSetStatus(id, body) {
    const status = parseEnum(body?.status, REPORT_STATUS, 'status')
    if (!status) throw new HttpError(400, 'status:es obligatorio')
    const report = await getReport(id)
    const reason = String(body.reason ?? (status === 'CLOSED' ? 'RECOVERED' : status)).toUpperCase().slice(0, 40)
    return toInternalDTO(await setStatus(report, status, reason))
  },

  /** Para notification-service (HU-25): reportes que expiran en los próximos `days` días. */
  async expiringSoon(query) {
    const days = Math.max(1, Number.parseInt(query.days, 10) || config.reminderDays)
    const now = Date.now()
    const reports = await repo.findActiveByLastActivity({
      after: new Date(now - config.expirationDays * DAY_MS),
      before: new Date(now - (config.expirationDays - days) * DAY_MS),
    })
    return reports.map(toInternalDTO)
  },

  /** HU-16: pasa a EXPIRED los reportes con más de EXPIRATION_DAYS días sin actividad. */
  async expireInactive() {
    const reports = await repo.findActiveByLastActivity({
      before: new Date(Date.now() - config.expirationDays * DAY_MS),
    })
    for (const report of reports) await setStatus(report, 'EXPIRED', 'INACTIVITY')
    return reports.length
  },

  /** Para las métricas (HU-18 / HU-19): recuperación por campus y tiempo promedio. */
  async stats() {
    const byCampus = new Map()
    const blank = (campusId) => ({ campusId, total: 0, active: 0, closed: 0, expired: 0, recovered: 0, hours: 0 })
    const global = blank(null)

    for (const r of await repo.findForStats()) {
      if (!byCampus.has(r.campusId)) byCampus.set(r.campusId, blank(r.campusId))
      for (const acc of [byCampus.get(r.campusId), global]) {
        acc.total++
        acc[r.status.toLowerCase()]++
        if (r.status === 'CLOSED' && RECOVERED_REASONS.includes(r.closeReason)) {
          acc.recovered++
          acc.hours += (new Date(r.closedAt) - new Date(r.creationDate)) / 3_600_000
        }
      }
    }

    const finish = ({ hours, ...acc }) => ({
      ...acc,
      recoveryRate: acc.total === 0 ? 0 : Math.round((acc.recovered * 1000) / acc.total) / 10,
      avgRecoveryHours: acc.recovered === 0 ? 0 : Math.round((hours * 10) / acc.recovered) / 10,
    })
    const { campusId, ...totals } = finish(global)
    return { ...totals, byCampus: [...byCampus.values()].map(finish).sort((a, b) => a.campusId - b.campusId) }
  },
}
