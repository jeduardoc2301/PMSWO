/**
 * Authentication Components
 * 
 * This module exports components and utilities for protecting routes and pages.
 */

// Client-side protection (use in client components)
export { ProtectedRoute } from './protected-route'
export type { ProtectedRouteProps } from './protected-route'

// Server-side protection (use in server components)
export { ProtectedPage, getCurrentUser, checkPermission, checkRole } from './protected-page'
export type { ProtectedPageProps } from './protected-page'
