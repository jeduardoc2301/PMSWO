# Prisma Setup Guide

## Initial Setup

### 1. Install Dependencies

Prisma and Prisma Client have been added to the project:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```bash
# For local development
DATABASE_URL="mysql://user:password@localhost:3306/pm_saas"

# For production with AWS RDS MySQL 8.4
DATABASE_URL="mysql://username:password@your-rds-endpoint.us-east-1.rds.amazonaws.com:3306/pm_saas?connection_limit=15&pool_timeout=20&connect_timeout=10"
```

### 3. Generate Prisma Client

Generate the Prisma Client from the schema:

```bash
npm run prisma:generate
```

**Note**: If you encounter SSL certificate errors during Prisma engine download, try one of these solutions:

#### Solution A: Disable SSL verification temporarily (Development only)
```bash
# Windows PowerShell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
npm run prisma:generate
$env:NODE_TLS_REJECT_UNAUTHORIZED="1"

# Linux/Mac
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run prisma:generate
```

#### Solution B: Use corporate proxy settings
```bash
# Set proxy if behind corporate firewall
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
npm run prisma:generate
```

#### Solution C: Manual engine download
Download Prisma engines manually from [Prisma Releases](https://github.com/prisma/prisma-engines/releases) and place them in `node_modules/@prisma/engines`.

### 4. Run Database Migrations

For local development:
```bash
npm run prisma:migrate
```

For production deployment:
```bash
npm run prisma:migrate:deploy
```

## Database Connection Configuration

### Local MySQL Setup

1. Install MySQL 8.0+ locally
2. Create database:
```sql
CREATE DATABASE pm_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Update `.env` with your local credentials

### AWS RDS MySQL Configuration

The production setup uses AWS RDS MySQL 8.4 with the following specifications:

- **Instance Type**: db.t4g.micro
- **Storage**: 20GB GP3 with 3000 IOPS
- **Region**: us-east-1b
- **Engine**: MySQL 8.4

#### Connection Pooling

The connection string includes optimized pooling parameters:

```
?connection_limit=15&pool_timeout=20&connect_timeout=10
```

- `connection_limit=15`: Max connections per Prisma Client instance
  - db.t4g.micro supports ~85 max connections
  - Allows 5-6 app instances with headroom
  
- `pool_timeout=20`: Wait time for available connection (seconds)
  
- `connect_timeout=10`: Initial connection timeout (seconds)

#### Security Best Practices

1. **Use AWS Secrets Manager** for credentials:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"

const client = new SecretsManagerClient({ region: "us-east-1" })
const response = await client.send(
  new GetSecretValueCommand({ SecretId: "prod/pm-saas/db" })
)
const credentials = JSON.parse(response.SecretString!)
```

2. **Enable SSL/TLS**:
```
DATABASE_URL="mysql://...?sslmode=require"
```

3. **Configure Security Groups**:
   - Allow inbound MySQL (3306) only from application security group
   - No public access

4. **Enable RDS Encryption**:
   - Encryption at rest
   - Encryption in transit

## Multi-Tenant Architecture

### How It Works

The application uses logical multi-tenancy:

1. All tenant-scoped tables have `organization_id` column
2. Middleware automatically filters queries by organization
3. Composite indexes optimize multi-tenant queries

### Using in API Routes

```typescript
import { getPrismaWithOrganization } from '@/lib/prisma-middleware'
import { getServerSession } from 'next-auth'

export async function GET(request: Request) {
  const session = await getServerSession()
  if (!session?.user?.organizationId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const prisma = getPrismaWithOrganization(session.user.organizationId)
  
  // Automatically filtered by organization
  const projects = await prisma.project.findMany()
  
  return Response.json(projects)
}
```

### Security Considerations

- **Never trust client input** for organization_id
- **Always get organization_id from session**
- **Validate user belongs to organization**
- **Use middleware for automatic filtering**

## Schema Overview

### Core Models

1. **Organization**: Tenant root entity
2. **User**: Users with roles and organization membership
3. **Project**: Projects within an organization
4. **WorkItem**: Tasks/work items in Kanban board
5. **KanbanColumn**: Kanban board columns
6. **Blocker**: Blockers preventing work item progress
7. **Risk**: Project risks
8. **Agreement**: Agreements and commitments
9. **AIAnalysisCache**: Cached AI analysis results

### Relationships

- Organization → Users, Projects (one-to-many)
- Project → WorkItems, Blockers, Risks, Agreements (one-to-many)
- WorkItem → Blockers, Changes (one-to-many)
- WorkItem ↔ Agreements (many-to-many)

## Common Operations

### Create Organization

```typescript
const org = await prisma.organization.create({
  data: {
    name: "Acme Corp",
    settings: {
      defaultLocale: "es",
      blockerCriticalThresholdHours: 48,
      aiAnalysisCacheDurationHours: 24
    }
  }
})
```

### Create User

```typescript
const user = await prisma.user.create({
  data: {
    organizationId: org.id,
    email: "user@example.com",
    passwordHash: hashedPassword,
    name: "John Doe",
    roles: ["PROJECT_MANAGER"],
    locale: "es"
  }
})
```

### Query with Relations

```typescript
const project = await prisma.project.findUnique({
  where: { id: projectId },
  include: {
    workItems: {
      where: { status: 'IN_PROGRESS' },
      include: {
        owner: true,
        blockers: { where: { resolvedAt: null } }
      }
    },
    risks: { where: { status: 'IDENTIFIED' } }
  }
})
```

## Troubleshooting

### "Can't reach database server"

1. Check DATABASE_URL is correct
2. Verify MySQL is running
3. Check firewall/security group rules
4. Test connection: `mysql -h host -u user -p`

### "Table doesn't exist"

Run migrations:
```bash
npm run prisma:migrate
```

### "Prisma Client not generated"

Generate client:
```bash
npm run prisma:generate
```

### Connection pool exhausted

1. Check `connection_limit` in DATABASE_URL
2. Ensure connections are properly closed
3. Monitor RDS connections in CloudWatch
4. Consider increasing RDS instance size

### Slow queries

1. Enable query logging in Prisma Client
2. Check RDS Performance Insights
3. Add indexes for frequently filtered fields
4. Use `select` to limit returned fields

## Development Workflow

1. **Modify schema**: Edit `prisma/schema.prisma`
2. **Create migration**: `npm run prisma:migrate`
3. **Generate client**: `npm run prisma:generate`
4. **Update code**: Use new types/models
5. **Test locally**: Verify changes work
6. **Deploy**: Run `npm run prisma:migrate:deploy` in production

## Useful Commands

```bash
# Open Prisma Studio (database GUI)
npm run prisma:studio

# Validate schema
npm run prisma:validate

# Format schema
npm run prisma:format

# View migration status
npx prisma migrate status

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

## Next Steps

After completing Prisma setup:

1. ✅ Prisma installed and configured
2. ✅ Schema defined with multi-tenant support
3. ✅ Connection pooling configured for RDS
4. ✅ Multi-tenant middleware created
5. ⏭️ Run migrations to create database tables
6. ⏭️ Implement authentication (NextAuth.js)
7. ⏭️ Create API routes using Prisma client
8. ⏭️ Build UI components

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma MySQL Guide](https://www.prisma.io/docs/concepts/database-connectors/mysql)
- [AWS RDS Best Practices](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_BestPractices.html)
- [Multi-Tenancy with Prisma](https://www.prisma.io/docs/guides/database/multi-tenancy)
