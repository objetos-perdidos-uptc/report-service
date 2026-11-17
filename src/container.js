// Raíz de composición: el ÚNICO lugar que conoce a la vez el dominio y los adaptadores.
// Aquí se decide qué adaptador implementa cada puerto. Para pasar a RabbitMQ/Kafka, por ejemplo,
// solo se cambia `events` por el nuevo adaptador.
import { ChangeReportStatus } from './application/use-cases/change-report-status.js'
import { CloseReport } from './application/use-cases/close-report.js'
import { CreateReport } from './application/use-cases/create-report.js'
import { ExpireInactiveReports } from './application/use-cases/expire-inactive-reports.js'
import { AddReportPhotos, RemoveReportPhoto } from './application/use-cases/manage-photos.js'
import { RenewReport } from './application/use-cases/renew-report.js'
import { UpdateReport } from './application/use-cases/update-report.js'
import { VerifyPrivateFeature } from './application/use-cases/verify-private-feature.js'
import { ReportQueries } from './application/queries/report.queries.js'
import { ExpirationPolicy } from './domain/value-objects.js'
import { config } from './infrastructure/config.js'
import { InProcessEventPublisher } from './infrastructure/messaging/in-process-event-publisher.js'
import { logEvent, registerMatchingBridge } from './infrastructure/messaging/subscribers.js'
import { SequelizeReportRepository } from './infrastructure/persistence/sequelize-report.repository.js'
import { LocalPhotoStorage } from './infrastructure/storage/local-photo-storage.js'

/** `adapters` permite reemplazar cualquier adaptador (p. ej. en las pruebas). */
export function buildContainer(adapters = {}) {
  // Adaptadores de salida (implementan los puertos del dominio)
  const reports = adapters.reports ?? new SequelizeReportRepository()
  const storage = adapters.storage ?? new LocalPhotoStorage(config.uploadDir)
  const events = adapters.events ?? createEventPublisher()

  const policy = new ExpirationPolicy(config.expirationDays)
  const deps = { reports, events, storage, policy, maxPhotos: config.maxPhotos }

  return {
    policy,
    commands: {
      createReport: new CreateReport(deps),
      updateReport: new UpdateReport(deps),
      closeReport: new CloseReport(deps),
      renewReport: new RenewReport(deps),
      addReportPhotos: new AddReportPhotos(deps),
      removeReportPhoto: new RemoveReportPhoto(deps),
      changeReportStatus: new ChangeReportStatus(deps),
      expireInactiveReports: new ExpireInactiveReports(deps),
      verifyPrivateFeature: new VerifyPrivateFeature(deps),
    },
    queries: new ReportQueries({ reports, policy, reminderDays: config.reminderDays }),
  }
}

function createEventPublisher() {
  const publisher = new InProcessEventPublisher().subscribe('*', logEvent)
  registerMatchingBridge(publisher)
  return publisher
}
