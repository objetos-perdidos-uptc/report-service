// Pruebas del agregado Report: reglas de negocio puras, sin base de datos ni HTTP.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ReportEvents } from '../../src/domain/events.js'
import { Report } from '../../src/domain/report.js'
import { ExpirationPolicy, PrivateFeature } from '../../src/domain/value-objects.js'

const lost = () => Report.create({
  type: 'lost',
  name: 'Mochila azul',
  categoryId: 5,
  campusId: 1,
  userId: '7',
  privateFeature: 'Nombre bordado por dentro',
  dateLost: new Date('2026-10-01'),
  dateOfDiscovery: new Date('2026-10-02'),   // no aplica a LOST: se descarta
  location: { latitude: 5.55, longitude: -73.35, textDirection: 'Biblioteca' },
})

const saved = (report, id = 1) => {
  report.reportId = id
  report.pullEvents()
  return report
}

test('crear un LOST lo deja ACTIVE, descarta campos de FOUND y registra report.created', () => {
  const report = lost()
  assert.equal(report.type, 'LOST')
  assert.equal(report.status, 'ACTIVE')
  assert.equal(report.dateOfDiscovery, null)
  const [event] = report.pullEvents()
  assert.equal(event.type, ReportEvents.CREATED)
  assert.equal(report.pullEvents().length, 0, 'los eventos se entregan una sola vez')
})

test('un LOST exige característica privada y fecha de pérdida; un FOUND, fecha de hallazgo', () => {
  assert.throws(() => Report.create({ type: 'LOST', name: 'Llaves', categoryId: 3, campusId: 1, userId: 7 }),
    (e) => e.code === 'VALIDATION' && e.message.includes('privateFeature') && e.message.includes('dateLost'))
  assert.throws(() => Report.create({ type: 'FOUND', name: 'Llaves', categoryId: 3, campusId: 1, userId: 7 }),
    (e) => e.message.includes('dateOfDiscovery'))
  assert.throws(() => Report.create({ type: 'STOLEN', name: 'x', categoryId: 1, campusId: 1, userId: 7 }),
    { code: 'VALIDATION' })
})

test('la característica privada nunca sale en el snapshot ni en los eventos', () => {
  const report = lost()
  assert.equal('privateFeature' in report.snapshot(), false)
  assert.equal('privateFeature' in report.pullEvents()[0].report, false)
})

test('solo el dueño puede modificar su reporte', () => {
  const report = saved(lost())
  assert.doesNotThrow(() => report.assertOwnedBy(7))
  assert.throws(() => report.assertOwnedBy('8'), { code: 'FORBIDDEN' })
})

test('ciclo de vida: cerrar, no renovar cerrado, expirar y renovar expirado', () => {
  const closed = saved(lost())
  closed.close('RECOVERED_OTHER_MEANS')
  assert.equal(closed.status, 'CLOSED')
  assert.equal(closed.isRecovered(), true)
  assert.throws(() => closed.renew(), { code: 'BUSINESS_RULE' })
  assert.throws(() => closed.update({ color: 'rojo' }), { code: 'BUSINESS_RULE' })

  const expired = saved(lost(), 2)
  expired.expire()
  assert.equal(expired.status, 'EXPIRED')
  expired.renew()
  assert.equal(expired.status, 'ACTIVE')
  assert.deepEqual(expired.pullEvents().map((e) => e.type), [ReportEvents.EXPIRED, ReportEvents.RENEWED])
})

test('máximo de fotos por reporte', () => {
  const report = saved(lost())
  report.addPhotos(['a.jpg', 'b.jpg'], 3)
  assert.deepEqual(report.snapshot().photos, ['/reports/photos/a.jpg', '/reports/photos/b.jpg'])
  assert.throws(() => report.addPhotos(['c.jpg', 'd.jpg'], 3), { code: 'BUSINESS_RULE' })
})

test('comparar la característica privada ignora mayúsculas, tildes y espacios', () => {
  const report = saved(lost())
  assert.equal(report.matchesPrivateFeature('  nombre BORDADO por déntro '), true)
  assert.equal(report.matchesPrivateFeature('otra cosa'), false)
  assert.equal(PrivateFeature.normalize('  Á  b '), 'a b')
})

test('la política de expiración calcula la fecha límite', () => {
  const policy = new ExpirationPolicy(30)
  assert.equal(policy.expiresAt('2026-10-01T00:00:00Z').toISOString(), '2026-10-31T00:00:00.000Z')
  assert.equal(policy.inactiveSince(new Date('2026-10-31T00:00:00Z')).toISOString(), '2026-10-01T00:00:00.000Z')
})
