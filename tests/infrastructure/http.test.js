// Prueba de punta a punta de la API HTTP con adaptadores en memoria (sin PostgreSQL ni Eureka).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { InMemoryReportRepository } from '../support/in-memory-report.repository.js'

process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'report-uploads-'))
const { buildContainer } = await import('../../src/container.js')
const { createApp } = await import('../../src/infrastructure/http/app.js')
const { InProcessEventPublisher } = await import('../../src/infrastructure/messaging/in-process-event-publisher.js')

const published = []
const reports = new InMemoryReportRepository()
const container = buildContainer({
  reports,
  events: new InProcessEventPublisher().subscribe('*', (e) => published.push(e)),
})
let server
let base

before(async () => {
  server = createApp(container).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  server.close()
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true })
})

const as = (id, campusId = 1) => ({ 'X-User-Id': String(id), 'X-User-CampusId': String(campusId) })
async function call(method, url, { user = as(7), body, form } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...user, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

const lostBody = {
  type: 'LOST', name: 'Mochila azul', categoryId: 5, color: 'azul',
  privateFeature: 'Nombre bordado', dateLost: '2026-10-01T10:00:00Z',
  location: { latitude: 5.55, longitude: -73.35, textDirection: 'Biblioteca' },
}

test('flujo completo de un reporte por HTTP', async () => {
  assert.equal((await call('GET', '/reports/feed', { user: {} })).status, 401)

  const created = await call('POST', '/reports', { body: lostBody })
  assert.equal(created.status, 201)
  assert.equal(created.body.categoryName, 'Mochilas y bolsos')
  assert.equal(created.body.privateFeature, 'Nombre bordado')
  const id = created.body.reportId

  const invalid = await call('POST', '/reports', { body: { type: 'LOST', name: 'x', categoryId: 5 } })
  assert.equal(invalid.status, 400)
  assert.match(invalid.body.detail, /privateFeature/)
  assert.equal((await call('POST', '/reports', { body: { ...lostBody, categoryId: 99 } })).status, 400)

  // Feed: otro usuario del campus lo ve sin la característica privada; otro campus no lo ve
  const feed = await call('GET', '/reports/feed', { user: as(8) })
  assert.equal(feed.body.totalElements, 1)
  assert.equal('privateFeature' in feed.body.content[0], false)
  assert.equal((await call('GET', '/reports/feed', { user: as(9, 2) })).body.totalElements, 0)
  assert.equal((await call('GET', '/reports/search?q=MOCHILA')).body.totalElements, 1)
  assert.equal((await call('GET', '/reports/search')).status, 400)

  // Solo el dueño edita
  assert.equal((await call('PUT', `/reports/${id}`, { user: as(8), body: { color: 'rojo' } })).status, 403)
  assert.equal((await call('PUT', `/reports/${id}`, { body: { color: 'azul oscuro' } })).body.color, 'azul oscuro')

  // Fotos (multipart)
  const form = new FormData()
  form.append('photos', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'a.png')
  const withPhoto = await call('POST', `/reports/${id}/photos`, { form })
  assert.equal(withPhoto.status, 201)
  assert.equal(withPhoto.body.photos.length, 1)
  const photoUrl = withPhoto.body.photos[0]
  assert.equal((await fetch(base + photoUrl, { headers: as(8) })).status, 200)

  // Interno: verificación de característica privada
  const ok = await call('POST', `/internal/reports/${id}/verify-private-feature`, { body: { privateFeature: ' NOMBRE bordado ' } })
  assert.equal(ok.body.matches, true)
  assert.equal('privateFeature' in (await call('GET', `/internal/reports/${id}`)).body, false)

  // Cerrar, no renovar cerrado, historial y estadísticas
  assert.equal((await call('PATCH', `/reports/${id}/close`)).body.closeReason, 'RECOVERED_OTHER_MEANS')
  assert.equal((await call('PATCH', `/reports/${id}/renew`)).status, 400)
  assert.equal((await call('GET', '/reports/me?status=CLOSED')).body.length, 1)
  assert.equal((await call('GET', '/internal/reports/stats')).body.recovered, 1)
  assert.equal((await call('GET', '/reports/999')).status, 404)

  assert.deepEqual(published.map((e) => e.type), [
    'report.created', 'report.updated', 'report.photos-changed', 'report.closed',
  ])
})

test('expiración por inactividad (HU-16) y reportes por expirar (HU-25)', async () => {
  const { body } = await call('POST', '/reports', {
    body: { type: 'FOUND', name: 'Paraguas', categoryId: 1, dateOfDiscovery: '2026-10-01T10:00:00Z' },
  })
  reports.age(body.reportId, 28)
  assert.equal((await call('GET', '/internal/reports/expiring?days=3')).body[0].reportId, body.reportId)

  reports.age(body.reportId, 3)
  assert.equal(await container.commands.expireInactiveReports.execute(), 1)
  assert.equal((await call('GET', `/internal/reports/${body.reportId}`)).body.status, 'EXPIRED')
  assert.equal(published.at(-1).type, 'report.expired')
})
