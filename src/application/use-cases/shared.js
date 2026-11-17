import { NotFoundError, ValidationError } from '../../domain/errors.js'

export function parseId(value, name = 'reportId') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${name} inválido`)
  return n
}

export async function loadReport(reports, reportId) {
  const report = await reports.findById(parseId(reportId))
  if (!report) throw new NotFoundError('Reporte no encontrado')
  return report
}

export async function assertCategoryExists(reports, categoryId) {
  if (categoryId != null && !(await reports.categoryExists(categoryId))) {
    throw new ValidationError('categoryId:la categoría no existe')
  }
}

/**
 * Cierra un caso de uso que modificó el agregado: guarda, publica sus eventos de dominio
 * y devuelve el reporte recién leído (con nombre de categoría e IDs de fotos).
 */
export async function commit({ reports, events }, report) {
  await reports.save(report)
  await events.publish(report.pullEvents())
  return reports.findById(report.reportId)
}
