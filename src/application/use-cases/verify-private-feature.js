import { ValidationError } from '../../domain/errors.js'
import { PrivateFeature } from '../../domain/value-objects.js'
import { loadReport } from './shared.js'

/** HU-12: claim-service valida lo que dice el reclamante sin conocer la característica privada. */
export class VerifyPrivateFeature {
  constructor({ reports }) {
    this.reports = reports
  }

  async execute({ reportId, privateFeature }) {
    if (!PrivateFeature.normalize(privateFeature)) throw new ValidationError('privateFeature:es obligatorio')
    const report = await loadReport(this.reports, reportId)
    return {
      reportId: report.reportId,
      hasPrivateFeature: report.privateFeature !== null,
      matches: report.matchesPrivateFeature(privateFeature),
    }
  }
}
