import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromCreateRequest, fromUpdateRequest, toInternalDTO, toPublicDTO } from '../../src/application/dto/report.dto.js'
import { Report } from '../../src/domain/report.js'
import { ExpirationPolicy } from '../../src/domain/value-objects.js'

const user = { id: '7', campusId: 1, role: 'STUDENT' }
const policy = new ExpirationPolicy(30)

const body = {
  type: 'LOST',
  name: ' Mochila azul ',
  categoryId: '5',
  privateFeature: 'Nombre bordado por dentro',
  dateLost: '2026-10-01T10:00:00Z',
  location: { latitude: 5.55, longitude: -73.35, textDirection: 'Biblioteca' },
}

test('el request se convierte en comando: limpia formatos y toma dueño y campus del token', () => {
  const command = fromCreateRequest({ ...body, campusId: 99, userId: 99 }, user)
  assert.equal(command.name, 'Mochila azul')
  assert.equal(command.categoryId, 5)
  assert.equal(command.campusId, 1)
  assert.equal(command.userId, '7')
})

test('errores de formato son de validación', () => {
  assert.throws(() => fromCreateRequest({ ...body, dateLost: '2999-01-01' }, user), { code: 'VALIDATION' })
  assert.throws(() => fromCreateRequest({ ...body, categoryId: 'abc' }, user), { code: 'VALIDATION' })
})

test('actualizar solo trae los campos enviados', () => {
  assert.deepEqual(fromUpdateRequest({ color: ' rojo ' }), { color: 'rojo' })
})

test('DTO público: privateFeature solo para el dueño y nunca el userId; el interno no la incluye', () => {
  const report = Report.create(fromCreateRequest(body, user))
  report.reportId = 1
  assert.equal(toPublicDTO(report, '7', policy).privateFeature, 'Nombre bordado por dentro')
  assert.equal(toPublicDTO(report, '7', policy).isOwner, true)
  assert.equal('privateFeature' in toPublicDTO(report, '8', policy), false)
  assert.equal('userId' in toPublicDTO(report, '8', policy), false)
  assert.equal('privateFeature' in toInternalDTO(report, policy), false)
  assert.equal(toInternalDTO(report, policy).userId, 7)
})
