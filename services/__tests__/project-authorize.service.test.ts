import { beforeEach, describe, expect, it, vi } from 'vitest'

const { user, project, projectCollaborator } = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  projectCollaborator: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { user, project, projectCollaborator } }))

import { authorize, permisosDeProyecto } from '../project-authorize.service'
import { PERMISOS_DE_PROYECTO } from '@/lib/projects/permisos'

/** Un ADMIN sin invitación a un proyecto cuyo dueño es otra persona. */
function escenario(orgDelUsuario: string, orgDelProyecto: string) {
  user.findUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
    Promise.resolve(select.roles ? { roles: ['ADMIN'] } : { organizationId: orgDelUsuario })
  )
  project.findUnique.mockImplementation(({ select }: { select: Record<string, boolean> }) =>
    Promise.resolve(select.ownerId ? { ownerId: 'otro', projectManagerId: 'otro-mas' } : { organizationId: orgDelProyecto })
  )
  projectCollaborator.findUnique.mockResolvedValue(null)
}

describe('permisosDeProyecto y el ADMIN', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el ADMIN entra a cualquier proyecto de su organización sin estar invitado', async () => {
    escenario('org-1', 'org-1')
    const permisos = await permisosDeProyecto('admin', 'proyecto')
    expect(permisos.size).toBe(PERMISOS_DE_PROYECTO.length)
    await expect(authorize('admin', 'proyecto', 'view_board')).resolves.toBeUndefined()
  })

  it('el ADMIN de otra organización no entra', async () => {
    escenario('org-1', 'org-2')
    expect((await permisosDeProyecto('admin', 'proyecto')).size).toBe(0)
    await expect(authorize('admin', 'proyecto', 'view_board')).rejects.toMatchObject({ name: 'AuthorizationError' })
  })
})
