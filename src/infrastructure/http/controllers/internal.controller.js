// Adaptador de entrada HTTP para los otros microservicios (/internal).
import { toInternalDTO, toMatchingDTO } from '../../../application/dto/report.dto.js'
import { ReportType } from '../../../domain/value-objects.js'

export function internalController({ commands, queries, policy }) {
  const internal = (report) => toInternalDTO(report, policy)
  // ?format=matching devuelve el contrato de matching-service (snake_case + location_text).
  const pick = (req) => (req.query.format === 'matching' ? toMatchingDTO : internal)

  return {
    list: async (req, res) => res.json((await queries.list(req.query)).map(pick(req))),

    expiring: async (req, res) => res.json((await queries.expiring(req.query)).map(internal)),

    stats: async (req, res) => res.json(await queries.stats()),

    detail: async (req, res) => res.json(pick(req)(await queries.detail(req.params.id))),

    /**
     * Cuerpo listo para POST /api/v1/matches/evaluate de matching-service:
     * el reporte objetivo + los reportes ACTIVE del tipo contrario en la misma sede.
     */
    matchingRequest: async (req, res) => {
      const target = await queries.detail(req.params.id)
      const opposite = target.type === ReportType.LOST ? ReportType.FOUND : ReportType.LOST
      const candidates = await queries.list({ type: opposite, campusId: target.campusId })
      res.json({ target_report: toMatchingDTO(target), candidates: candidates.map(toMatchingDTO) })
    },

    verifyPrivateFeature: async (req, res) => res.json(await commands.verifyPrivateFeature.execute({
      reportId: req.params.id, privateFeature: req.body?.privateFeature,
    })),

    setStatus: async (req, res) => res.json(internal(await commands.changeReportStatus.execute({
      reportId: req.params.id, status: req.body?.status, reason: req.body?.reason,
    }))),
  }
}
