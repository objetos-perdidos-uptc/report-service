// Cliente REST de Eureka: registro, heartbeat y descubrimiento de otros servicios.
import { config } from '../config.js'

// Eureka pide el nombre de la app en MAYÚSCULAS
const APP_NAME = config.appName.toUpperCase()
const INSTANCE_ID = `${config.hostName}:${config.appName}:${config.port}`
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' }

let heartbeatTimer = null
let registered = false

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function instancePayload() {
  const { hostName: host, port } = config
  return {
    instance: {
      instanceId: INSTANCE_ID,
      hostName: host,
      app: APP_NAME,
      ipAddr: config.ipAddr,
      status: 'UP',
      overriddenstatus: 'UNKNOWN',
      port: { $: port, '@enabled': 'true' },
      securePort: { $: 443, '@enabled': 'false' },
      countryId: 1,
      dataCenterInfo: {
        '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
        name: 'MyOwn',
      },
      leaseInfo: { renewalIntervalInSecs: 30, durationInSecs: 90 },
      homePageUrl: `http://${host}:${port}/`,
      statusPageUrl: `http://${host}:${port}/health`,
      healthCheckUrl: `http://${host}:${port}/health`,
      vipAddress: config.appName,
      secureVipAddress: config.appName,
      metadata: { 'management.port': String(port) },
    },
  }
}

async function tryRegister() {
  const res = await fetch(`${config.eurekaUrl}/apps/${APP_NAME}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(instancePayload()),
    signal: AbortSignal.timeout(5000),
  })
  // 204 es el OK típico de Eureka
  if (res.status !== 200 && res.status !== 204) throw new Error(`HTTP ${res.status}`)
  registered = true
}

/** Registra la instancia en Eureka. Reintenta hasta lograrlo, por si Eureka aún no arrancó. */
export async function register() {
  for (let intento = 1; ; intento++) {
    try {
      await tryRegister()
      console.log(`Eureka: registrado como ${INSTANCE_ID}`)
      return
    } catch (e) {
      console.warn(`Eureka no disponible (intento ${intento}): ${e.message}`)
      await sleep(5000)
    }
  }
}

/** Renueva el lease cada 30s. Sin esto Eureka expulsa la instancia. */
export function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    try {
      const res = await fetch(`${config.eurekaUrl}/apps/${APP_NAME}/${INSTANCE_ID}`, {
        method: 'PUT',
        signal: AbortSignal.timeout(5000),
      })
      // 404: Eureka se reinició y perdió el registro -> volver a registrarse
      if (res.status === 404) await tryRegister()
    } catch (e) {
      console.warn(`Eureka heartbeat falló: ${e.message}`)
    }
  }, 30_000)
  heartbeatTimer.unref()
}

/** Avisa a Eureka al apagar el servicio (shutdown limpio). */
export async function deregister() {
  clearInterval(heartbeatTimer)
  if (!registered) return
  try {
    await fetch(`${config.eurekaUrl}/apps/${APP_NAME}/${INSTANCE_ID}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    })
    console.log(`Eureka: desregistrado ${INSTANCE_ID}`)
  } catch (e) {
    console.warn(`Eureka deregister falló: ${e.message}`)
  }
}

/** Service Discovery: devuelve la URL base de una instancia UP del servicio, o null. */
export async function resolve(serviceName) {
  const res = await fetch(`${config.eurekaUrl}/apps/${serviceName.toUpperCase()}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return null
  const data = await res.json()
  const instances = [].concat(data?.application?.instance ?? []).filter((i) => i.status === 'UP')
  if (instances.length === 0) return null
  const pick = instances[Math.floor(Math.random() * instances.length)]
  return `http://${pick.hostName}:${pick.port.$}`
}
