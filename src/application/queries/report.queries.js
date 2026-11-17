// Consultas (solo lectura): no modifican el agregado ni publican eventos.
import { ValidationError } from '../../domain/errors.js'
import { ReportStatus, ReportType } from '../../domain/value-objects.js'
import { loadReport, parseId } from '../use-cases/shared.js'

const optional = (parser) => (value) => (value === undefined || value === '' ? undefined : parser(value))
const optionalType = optional((v) => ReportType.parse(v))
const optionalStatus = optional((v) => ReportStatus.parse(v))
const optionalId = (name) => optional((v) => parseId(v, name))

function paging(query) {
  const page = Math.max(0, Number.parseInt(query.page, 10) || 0)
  const size = Math.min(50, Math.max(1, Number.parseInt(query.size, 10) || 20))
  return { page, size }
}

export class ReportQueries {
  constructor({ reports, policy, reminderDays }) {
    this.reports = reports
    this.policy = policy
    this.reminderDays = reminderDays
  }

  categories() {
    return this.reports.findCategories()
  }

  /** HU-05: feed de reportes activos del campus del usuario (un ADMIN puede pedir otro campus). */
  async feed(query, user) {
    const campusId = user.role === 'ADMIN' && query.campusId ? parseId(query.campusId, 'campusId') : user.campusId
    if (campusId == null) throw new ValidationError('Tu usuario no tiene un campus asociado')
    const { page, size } = paging(query)
    const filters = {
      campusId,
      status: ReportStatus.ACTIVE,
      type: optionalType(query.type),
      categoryId: optionalId('categoryId')(query.categoryId),
      q: String(query.q ?? '').trim().slice(0, 100) || undefined,
    }
    return { ...(await this.reports.findPage(filters, page, size)), page, size }
  }

  /** HU-22: búsqueda por palabra clave dentro del feed. */
  async search(query, user) {
    if (!String(query.q ?? '').trim()) throw new ValidationError('q:es obligatorio')
    return this.feed(query, user)
  }

  /** HU-23: historial de los reportes del usuario. */
  history(query, user) {
    return this.reports.findAll({
      userId: user.id,
      status: optionalStatus(query.status),
      type: optionalType(query.type),
    })
  }

  detail(reportId) {
    return loadReport(this.reports, reportId)
  }

  /** Para matching-service: reportes contra los que comparar (por defecto, los ACTIVE). */
  list(query) {
    return this.reports.findAll({
      type: optionalType(query.type),
      status: optionalStatus(query.status) ?? ReportStatus.ACTIVE,
      campusId: optionalId('campusId')(query.campusId),
      categoryId: optionalId('categoryId')(query.categoryId),
      userId: optionalId('userId')(query.userId),
    })
  }

  /** Para notification-service (HU-25): reportes que expiran en los próximos `days` días. */
  expiring(query, now = new Date()) {
    const days = Math.max(1, Number.parseInt(query.days, 10) || this.reminderDays)
    const ahead = new Date(now.getTime() + days * 86_400_000)
    return this.reports.findActiveByLastActivity({
      after: this.policy.inactiveSince(now),
      before: this.policy.inactiveSince(ahead),
    })
  }

  /** HU-18 / HU-19: tasa de recuperación por campus y tiempo promedio de recuperación. */
  async stats() {
    const blank = (campusId) => ({ campusId, total: 0, active: 0, closed: 0, expired: 0, recovered: 0, hours: 0 })
    const byCampus = new Map()
    const global = blank(null)

    for (const report of await this.reports.findAll({})) {
      if (!byCampus.has(report.campusId)) byCampus.set(report.campusId, blank(report.campusId))
      for (const acc of [byCampus.get(report.campusId), global]) {
        acc.total++
        acc[report.status.toLowerCase()]++
        if (report.isRecovered()) {
          acc.recovered++
          acc.hours += (new Date(report.closedAt) - new Date(report.creationDate)) / 3_600_000
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
  }
}
