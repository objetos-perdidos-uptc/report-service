// Consumidor de eventos de claim-service: cierra el reporte y es idempotente.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleClaimEvent } from '../../src/infrastructure/messaging/claim-events.consumer.js'
import { ChangeReportStatus } from '../../src/application/use-cases/change-report-status.js'
import { CreateReport } from '../../src/application/use-cases/create-report.js'
import { InProcessEventPublisher } from '../../src/infrastructure/messaging/in-process-event-publisher.js'
import { InMemoryReportRepository } from '../support/in-memory-report.repository.js'

test('claim.approved cierra el reporte como RECOVERED; repetirlo o mandar basura no rompe nada', async () => {
  const reports = new InMemoryReportRepository()
  const published = []
  const events = new InProcessEventPublisher().subscribe('*', (e) => published.push(e.type))
  const deps = { reports, events }

  const { reportId } = await new CreateReport(deps).execute({
    type: 'FOUND', name: 'Llaves', categoryId: 1, campusId: 1, userId: 7, dateOfDiscovery: new Date('2026-10-01'),
  })
  const changeStatus = new ChangeReportStatus(deps)

  assert.equal(await handleClaimEvent({ claimId: 'c1', reportId }, changeStatus), 'processed')
  const report = await reports.findById(reportId)
  assert.equal(report.status, 'CLOSED')
  assert.equal(report.closeReason, 'RECOVERED')
  assert.deepEqual(published, ['report.created', 'report.closed'])

  assert.equal(await handleClaimEvent({ claimId: 'c1', reportId }, changeStatus), 'ignored')   // duplicado
  assert.equal(await handleClaimEvent({ claimId: 'c2', reportId: 999 }, changeStatus), 'ignored')
  assert.equal(await handleClaimEvent({ claimId: 'c3' }, changeStatus), 'ignored')
})
