import { ValidationError } from '../../domain/errors.js'
import { CloseReason } from '../../domain/value-objects.js'
import { commit, loadReport } from './shared.js'

/** HU-06: el dueño cierra su reporte (p. ej. lo recuperó por otros medios). */
export class CloseReport {
  constructor({ reports, events }) {
    this.deps = { reports, events }
  }

  async execute({ reportId, userId, reason }) {
    const closeReason = reason ? CloseReason.parse(reason) : CloseReason.RECOVERED_OTHER_MEANS
    if (!CloseReason.byOwner.includes(closeReason)) {
      throw new ValidationError(`reason debe ser uno de: ${CloseReason.byOwner.join(', ')}`)
    }
    const report = await loadReport(this.deps.reports, reportId)
    report.assertOwnedBy(userId)
    report.close(closeReason)
    return commit(this.deps, report)
  }
}
