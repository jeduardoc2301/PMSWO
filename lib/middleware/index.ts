/**
 * Middleware exports
 * 
 * This file provides a central export point for all middleware functions.
 */

export { withAuth, createAuthResponse } from './withAuth'
export type { AuthContext, WithAuthOptions, ProtectedRouteHandler } from './withAuth'
