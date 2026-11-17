import { assertCategoryExists, commit, loadReport } from './shared.js'

/** HU-06: el dueño edita su reporte activo. */
export class UpdateReport {
  constructor({ reports, events }) {
    this.deps = { reports, events }
  }

  async execute({ reportId, userId, changes }) {
    const report = await loadReport(this.deps.reports, reportId)
    report.assertOwnedBy(userId)
    await assertCategoryExists(this.deps.reports, changes.categoryId)
    report.update(changes)
    return commit(this.deps, report)
  }
}
