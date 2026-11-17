// Puertos de salida (arquitectura hexagonal): lo que el dominio y los casos de uso NECESITAN
// del exterior, sin decir CÓMO se hace. Cada adaptador de infraestructura extiende una de estas
// clases (Sequelize, RabbitMQ, disco...) y se puede cambiar sin tocar el dominio.

const notImplemented = (port, method) => {
  throw new Error(`${port}.${method}() no está implementado por el adaptador`)
}

/** Persistencia del agregado Report. */
export class ReportRepository {
  /** @returns {Promise<import('./report.js').Report|null>} */
  async findById(reportId) { notImplemented('ReportRepository', 'findById') }

  /** Inserta o actualiza el reporte y sus fotos. Asigna los IDs generados sobre la misma instancia. */
  async save(report) { notImplemented('ReportRepository', 'save') }

  /** @returns {Promise<{ items: Report[], total: number }>} */
  async findPage(filters, page, size) { notImplemented('ReportRepository', 'findPage') }

  /** @returns {Promise<Report[]>} */
  async findAll(filters) { notImplemented('ReportRepository', 'findAll') }

  /** Reportes ACTIVE cuya última actividad es anterior a `before` (y posterior a `after`, si se pasa). */
  async findActiveByLastActivity({ before, after }) { notImplemented('ReportRepository', 'findActiveByLastActivity') }

  async findCategories() { notImplemented('ReportRepository', 'findCategories') }

  async categoryExists(categoryId) { notImplemented('ReportRepository', 'categoryExists') }
}

/** Publicación de eventos de dominio hacia el resto del sistema (EDA). */
export class EventPublisher {
  async publish(events) { notImplemented('EventPublisher', 'publish') }
}

/** Almacenamiento de los archivos de las fotos. */
export class PhotoStorage {
  async remove(filename) { notImplemented('PhotoStorage', 'remove') }
}
