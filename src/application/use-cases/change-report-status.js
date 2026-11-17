import { ValidationError } from '../../domain/errors.js'
import { CloseReason, ReportStatus } from '../../domain/value-objects.js'
import { commit, loadReport } from './shared.js'

/** Para otros microservicios (p. ej. claim-service al confirmar la entrega con OTP, HU-14). */
export class ChangeReportStatus {
  constructor({ reports, events }) {
    this.deps = { reports, events }
  }

  async execute({ reportId, status, reason }) {
    if (!status) throw new ValidationError('status:es obligatorio')
    const target = ReportStatus.parse(status)
    const report = await loadReport(this.deps.reports, reportId)

    if (target === ReportStatus.CLOSED) report.close(reason ?? CloseReason.RECOVERED)
    else if (target === ReportStatus.EXPIRED) report.expire()
    else report.renew()

    return commit(this.deps, report)
  }
}
