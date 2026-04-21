# Módulo: Dashboard de Rendimiento de Consultores

## Descripción General

Módulo exclusivo para el rol **ADMIN** que permite visualizar el rendimiento individual de cada consultor interno (`INTERNAL_CONSULTANT`) de la organización. Responde las preguntas clave que un Gerente o Líder se hace sobre su equipo de consultores.

---

## Acceso y Seguridad

- **Rol requerido:** `ADMIN` únicamente
- **Permiso:** `DASHBOARD_CONSULTANT` (nuevo permiso agregado al sistema RBAC)
- **Ruta:** `/{locale}/consultant-performance`
- **API:** `GET /api/v1/dashboard/consultants` y `GET /api/v1/dashboard/consultants/[id]`

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 App Router, React, TypeScript |
| UI | shadcn/ui, Tailwind CSS |
| Auth | NextAuth v5 + RBAC custom |
| Backend | Next.js API Routes |
| ORM | Prisma 5 |
| DB | MySQL (AWS RDS) |
| i18n | next-intl |

---

## Flujo de Navegación

```
/consultant-performance
  └── Lista de consultores (cards con foto/avatar, nombre, métricas rápidas)
        └── Click en consultor → /consultant-performance/[id]
              └── Dashboard detallado del consultor
```

---

## Vista 1: Lista de Consultores

### Componente: `ConsultantListClient`

Muestra todos los usuarios con rol `INTERNAL_CONSULTANT` de la organización como cards.

**Cada card muestra:**
- Avatar con iniciales (no hay foto real en el sistema)
- Nombre completo
- Email
- Proyectos activos (count)
- Tasa de completitud global (% work items DONE)
- Indicador de salud general (verde/amarillo/rojo)

---

## Vista 2: Dashboard Individual del Consultor

### Componente: `ConsultantDetailClient`

Dashboard completo con todas las métricas del consultor seleccionado.

---

## Métricas y Preguntas que Responde

### 1. Carga de Trabajo
> *¿Cuántos proyectos tiene asignados? ¿Está sobrecargado?*

- Total de proyectos donde es owner de work items
- Proyectos activos vs completados vs en espera
- Total de work items asignados
- Work items activos (no DONE)

### 2. Productividad
> *¿Está siendo productivo? ¿Completa sus tareas a tiempo?*

- % de work items completados (DONE / total)
- Work items completados en los últimos 30 días
- Work items completados a tiempo vs con retraso
- Promedio de días para completar un work item

### 3. Puntualidad
> *¿Cumple con los plazos? ¿Tiene tareas vencidas?*

- Work items vencidos (estimatedEndDate < hoy y status != DONE)
- % de tareas entregadas a tiempo
- Días promedio de retraso en tareas vencidas

### 4. Calidad / Problemas
> *¿Sus proyectos tienen muchos blockers o riesgos?*

- Blockers activos en sus proyectos
- Blockers resueltos vs activos
- Tiempo promedio de resolución de blockers
- Riesgos activos en sus proyectos (por nivel: LOW/MEDIUM/HIGH/CRITICAL)

### 5. Salud de Proyectos
> *¿Cómo están sus proyectos en general?*

Por cada proyecto del consultor:
- Nombre del proyecto y cliente
- Estado del proyecto
- % de completitud
- Blockers activos
- Riesgos activos
- Work items vencidos
- Indicador de salud (HEALTHY / AT_RISK / CRITICAL)

### 6. Acuerdos
> *¿Está cumpliendo con los compromisos?*

- Total de acuerdos en sus proyectos
- Acuerdos completados vs pendientes
- % de cumplimiento de acuerdos

### 7. Actividad Reciente
> *¿Cuándo fue la última vez que actualizó algo?*

- Últimos 5 cambios registrados en work items (WorkItemChange)
- Fecha del último cambio

---

## Lógica de Salud del Proyecto

Un proyecto se clasifica como:

| Estado | Criterio |
|--------|---------|
| `HEALTHY` | < 20% work items vencidos Y sin blockers críticos Y sin riesgos críticos |
| `AT_RISK` | 20-50% work items vencidos O blockers de severidad HIGH O riesgos HIGH |
| `CRITICAL` | > 50% work items vencidos O blocker CRITICAL activo O riesgo CRITICAL activo |

---

## Estructura de Archivos

```
app/
  [locale]/
    consultant-performance/
      page.tsx                          # Server component (metadata + auth check)
      consultant-performance-client.tsx # Lista de consultores
      [id]/
        page.tsx                        # Server component
        consultant-detail-client.tsx    # Dashboard individual

app/api/v1/dashboard/
  consultants/
    route.ts                            # GET lista de consultores con métricas
    [id]/
      route.ts                          # GET detalle de un consultor

components/consultant/
  consultant-card.tsx                   # Card de la lista
  consultant-metrics-summary.tsx        # Resumen de métricas (top)
  consultant-projects-table.tsx         # Tabla de proyectos con salud
  consultant-workitems-stats.tsx        # Stats de work items
  consultant-activity-feed.tsx          # Actividad reciente
```

---

## API Endpoints

### `GET /api/v1/dashboard/consultants`
Retorna lista de consultores con métricas resumidas.

**Response:**
```json
{
  "consultants": [
    {
      "id": "uuid",
      "name": "string",
      "email": "string",
      "activeProjects": 3,
      "totalWorkItems": 45,
      "completionRate": 0.67,
      "overdueItems": 2,
      "healthStatus": "AT_RISK"
    }
  ]
}
```

### `GET /api/v1/dashboard/consultants/[id]`
Retorna dashboard completo de un consultor.

**Response:**
```json
{
  "consultant": {
    "id": "uuid",
    "name": "string",
    "email": "string"
  },
  "summary": {
    "totalProjects": 4,
    "activeProjects": 3,
    "completedProjects": 1,
    "totalWorkItems": 45,
    "completedWorkItems": 30,
    "completionRate": 0.67,
    "overdueItems": 2,
    "onTimeDeliveryRate": 0.85,
    "avgDaysToComplete": 3.2,
    "activeBlockers": 1,
    "activeRisks": 2,
    "pendingAgreements": 3,
    "agreementCompletionRate": 0.75
  },
  "projects": [
    {
      "id": "uuid",
      "name": "string",
      "client": "string",
      "status": "ACTIVE",
      "completionRate": 0.6,
      "activeBlockers": 1,
      "activeRisks": 0,
      "overdueItems": 1,
      "healthStatus": "AT_RISK"
    }
  ],
  "recentActivity": [
    {
      "workItemTitle": "string",
      "field": "status",
      "oldValue": "TODO",
      "newValue": "DONE",
      "changedAt": "2026-04-01T00:00:00Z"
    }
  ]
}
```

---

## Navegación

Se agrega al menú lateral solo para usuarios con rol `ADMIN`:

```
📊 Dashboard Ejecutivo
📁 Proyectos
👥 Rendimiento Consultores  ← NUEVO (solo ADMIN)
⚙️ Configuración
```

---

## Consideraciones

- No usa IA, todo calculado desde la DB
- No exportable en esta versión (v1)
- Datos en tiempo real (sin caché)
- Respeta multi-tenancy: solo muestra consultores de la misma organización
- Responsive para desktop y tablet
