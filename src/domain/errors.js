// Errores del dominio. No saben nada de HTTP: el adaptador HTTP los traduce a códigos de estado.

export class DomainError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Un dato no cumple el formato o una regla de validación. */
export class ValidationError extends DomainError {
  constructor(message) { super('VALIDATION', message) }
}

/** La operación viola una regla de negocio (p. ej. editar un reporte cerrado). */
export class BusinessRuleError extends DomainError {
  constructor(message) { super('BUSINESS_RULE', message) }
}

export class NotFoundError extends DomainError {
  constructor(message) { super('NOT_FOUND', message) }
}

export class ForbiddenError extends DomainError {
  constructor(message) { super('FORBIDDEN', message) }
}
