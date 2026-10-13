import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fromCreateRequest, fromUpdateRequest, normalizeText, toInternalDTO, toPublicDTO,
} from '../src/dto/report.dto.js'

const user = { id: '7', campusId: 1, role: 'STUDENT' }

const lost = {
  type: 'lost',
  name: ' Mochila azul ',
  categoryId: 5,
  privateFeature: 'Nombre bordado por dentro',
  dateLost: '2026-10-01T10:00:00Z',
  location: { latitude: 5.55, longitude: -73.35, textDirection: 'Biblioteca' },
}

const stored = {
  reportId: 1, type: 'LOST', status: 'ACTIVE', name: 'Mochila azul', categoryId: 5, campusId: 1,
  userId: '7', latitude: 5.55, longitude: -73.35, textDirection: 'Biblioteca',
  privateFeature: 'Nombre bordado por dentro', lastActivityDate: new Date(),
  photos: [{ url: '/reports/photos/a.jpg' }],
}

test('crear LOST: normaliza y toma dueño y campus del token', () => {
  const data = fromCreateRequest({ ...lost, campusId: 99, userId: 99 }, user)
  assert.equal(data.type, 'LOST')
  assert.equal(data.name, 'Mochila azul')
  assert.equal(data.campusId, 1)
  assert.equal(data.userId, '7')
  assert.equal(data.latitude, 5.55)
})

test('crear LOST sin característica privada ni fecha es 400', () => {
  assert.throws(
    () => fromCreateRequest({ type: 'LOST', name: 'Llaves', categoryId: 3 }, user),
    (e) => e.status === 400 && e.message.includes('privateFeature') && e.message.includes('dateLost'),
  )
})

test('crear FOUND no exige característica privada', () => {
  const data = fromCreateRequest(
    { type: 'FOUND', name: 'Llaves', categoryId: 3, dateOfDiscovery: '2026-10-02T08:00:00Z' }, user)
  assert.equal(data.privateFeature, null)
  assert.equal(data.dateLost, undefined)
})

test('tipo inválido y fecha futura son 400', () => {
  assert.throws(() => fromCreateRequest({ ...lost, type: 'STOLEN' }, user), { status: 400 })
  assert.throws(() => fromCreateRequest({ ...lost, dateLost: '2999-01-01' }, user), { status: 400 })
})

test('actualizar: solo los campos enviados', () => {
  assert.deepEqual(fromUpdateRequest({ color: 'rojo' }, 'LOST'), { color: 'rojo' })
  assert.throws(() => fromUpdateRequest({}, 'LOST'), { status: 400 })
})

test('la característica privada solo la ve el dueño y nunca sale en el DTO interno', () => {
  assert.equal(toPublicDTO(stored, '7').privateFeature, 'Nombre bordado por dentro')
  assert.equal(toPublicDTO(stored, '7').isOwner, true)
  assert.equal('privateFeature' in toPublicDTO(stored, '8'), false)
  assert.equal('userId' in toPublicDTO(stored, '8'), false)
  assert.equal('privateFeature' in toInternalDTO(stored), false)
  assert.equal(toInternalDTO(stored).userId, 7)
  assert.deepEqual(toInternalDTO(stored).photos, ['/reports/photos/a.jpg'])
})

test('normalizeText ignora mayúsculas, tildes y espacios', () => {
  assert.equal(normalizeText('  Nombre   BORDADO por déntro '), 'nombre bordado por dentro')
})
