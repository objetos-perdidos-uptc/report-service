// Adaptador de entrada HTTP para los otros microservicios (/internal).
import { toInternalDTO } from '../../../application/dto/report.dto.js'

export function internalController({ commands, queries, policy }) {
  const dto = (report) => toInternalDTO(report, policy)

  return {
    list: async (req, res) => res.json((await queries.list(req.query)).map(dto)),

    expiring: async (req, res) => res.json((await queries.expiring(req.query)).map(dto)),

    stats: async (req, res) => res.json(await queries.stats()),

    detail: async (req, res) => res.json(dto(await queries.detail(req.params.id))),

    verifyPrivateFeature: async (req, res) => res.json(await commands.verifyPrivateFeature.execute({
      reportId: req.params.id, privateFeature: req.body?.privateFeature,
    })),

    setStatus: async (req, res) => res.json(dto(await commands.changeReportStatus.execute({
      reportId: req.params.id, status: req.body?.status, reason: req.body?.reason,
    }))),
  }
}
