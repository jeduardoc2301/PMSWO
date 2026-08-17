// Custom error classes for the application
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
    // `new.target.prototype`, no `AppError.prototype`: al fijar la clase base a secas, TODA subclase
    // quedaba aplanada a AppError y `error instanceof ValidationError` era **siempre falso** —el
    // objeto traía bien su `name` y su `statusCode`, pero su prototipo era el de la base—. Por eso
    // hay medio repositorio comprobando `|| error.name === 'ValidationError'`: ese respaldo es lo
    // único que funcionaba, y donde no se puso, el 400 o el 404 salía convertido en 500 genérico.
    // Con `new.target` cada subclase conserva su identidad y las dos formas de preguntar coinciden.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super('AUTHENTICATION_ERROR', message, 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHORIZATION_ERROR', message, 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
    this.name = 'ConflictError'
  }
}

export class AIServiceError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AI_SERVICE_ERROR', message, 500, details)
    this.name = 'AIServiceError'
  }
}

export class AIGuardrailsError extends AppError {
  constructor(message: string = 'Content blocked by AI guardrails') {
    super('AI_GUARDRAILS_ERROR', message, 400)
    this.name = 'AIGuardrailsError'
  }
}
