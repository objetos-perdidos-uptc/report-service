import { Report } from '../../domain/report.js'
import { assertCategoryExists, commit } from './shared.js'

/** HU-03 / HU-04: registrar un objeto perdido o encontrado. */
export class CreateReport {
  constructor({ reports, events }) {
    this.deps = { reports, events }
  }

  async execute(command) {
    await assertCategoryExists(this.deps.reports, command.categoryId)
    return commit(this.deps, Report.create(command))
  }
}
