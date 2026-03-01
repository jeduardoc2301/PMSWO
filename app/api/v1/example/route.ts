/**
 * Example API route demonstrating withAuth middleware usage
 * 
 * This file shows how to use the authentication middleware to protect
 * API routes and access organization context for multi-tenant queries.
 * 
 * DELETE THIS FILE in production - it's for demonstration only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/withAuth'
import { Permission } from '@/types'

/**
 * GET /api/v1/example
 * 
 * Example: Basic authentication without permission check
 * Any authenticated user can access this endpoint
 */
export const GET = withAuth(async (request, { params }, authContext) => {
  return NextResponse.json({
    message: 'You are authenticated!',
    user: {
      id: authContext.userId,
      organizationId: authContext.organizationId,
      roles: authContext.roles,
      locale: authContext.locale,
    },
  })
})

/**
 * POST /api/v1/example
 * 
 * Example: Authentication with permission check (OR mode)
 * User needs at least one of the specified permissions
 */
export const POST = withAuth(
  async (request, { params }, authContext) => {
    const body = await request.json()

    return NextResponse.json({
      message: 'You have permission to create projects!',
      organizationId: authContext.organizationId,
      data: body,
    })
  },
  {
    // User needs PROJECT_CREATE OR PROJECT_UPDATE permission
    requiredPermissions: [Permission.PROJECT_CREATE, Permission.PROJECT_UPDATE],
  }
)

/**
 * PUT /api/v1/example
 * 
 * Example: Authentication with permission check (AND mode)
 * User needs ALL of the specified permissions
 */
export const PUT = withAuth(
  async (request, { params }, authContext) => {
    const body = await request.json()

    return NextResponse.json({
      message: 'You have all required permissions!',
      organizationId: authContext.organizationId,
      data: body,
    })
  },
  {
    // User needs BOTH PROJECT_VIEW AND PROJECT_UPDATE permissions
    requiredPermissions: [Permission.PROJECT_VIEW, Permission.PROJECT_UPDATE],
    requireAllPermissions: true,
  }
)

/**
 * DELETE /api/v1/example
 * 
 * Example: Restricted endpoint requiring admin permissions
 */
export const DELETE = withAuth(
  async (request, { params }, authContext) => {
    return NextResponse.json({
      message: 'Resource deleted successfully',
      organizationId: authContext.organizationId,
    })
  },
  {
    requiredPermissions: [Permission.PROJECT_DELETE],
  }
)
