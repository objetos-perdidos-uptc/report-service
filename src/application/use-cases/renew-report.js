import { commit, loadReport } from './shared.js'

/** HU-25: el dueño renueva su reporte para que no expire (o vuelva al feed si ya expiró). */
export class RenewReport {
  constructor({ reports, events }) {
    this.deps = { reports, events }
  }

  async execute({ reportId, userId }) {
    const report = await loadReport(this.deps.reports, reportId)
    report.assertOwnedBy(userId)
    report.renew()
    return commit(this.deps, report)
  }
}
