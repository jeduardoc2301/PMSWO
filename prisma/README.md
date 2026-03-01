# Prisma Database Setup

This directory contains the Prisma schema and migration files for the SaaS Project Management platform.

## Database Configuration

### Local Development

1. Create a `.env` file in the project root:
```bash
DATABASE_URL="mysql://user:password@localhost:3306/pm_saas"
```

2. Generate Prisma Client:
```bash
npx prisma generate
```

3. Run migrations:
```bash
npx prisma migrate dev
```

### Production (AWS RDS MySQL 8.4)

The production database is configured with connection pooling optimized for the RDS instance:

- Instance: db.t4g.micro
- Storage: 20GB with 3000 IOPS
- Region: us-east-1b
- Engine: MySQL 8.4

#### Connection String Format

```
DATABASE_URL="mysql://username:password@your-rds-endpoint.us-east-1.rds.amazonaws.com:3306/pm_saas?connection_limit=15&pool_timeout=20&connect_timeout=10"
```

#### Connection Pool Parameters

- `connection_limit=15`: Maximum connections per Prisma Client instance
  - Recommended: 10-20 for db.t4g.micro (max connections ~85)
  - Allows multiple app instances while preventing connection exhaustion
  
- `pool_timeout=20`: Seconds to wait for an available connection
  - Prevents request timeouts during high load
  
- `connect_timeout=10`: Seconds to wait for initial database connection
  - Faster failure detection for connection issues

#### Best Practices for Production

1. **Use AWS Secrets Manager** for database credentials:
   ```typescript
   import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"
   
   const secret = await client.send(new GetSecretValueCommand({
     SecretId: "prod/pm-saas/db"
   }))
   ```

2. **Connection Pooling**: The configured limits prevent connection exhaustion on db.t4g.micro

3. **SSL/TLS**: Enable SSL for RDS connections in production:
   ```
   DATABASE_URL="mysql://...?sslmode=require&sslcert=/path/to/rds-ca-cert.pem"
   ```

4. **Read Replicas**: For read-heavy workloads, configure read replicas:
   ```typescript
   const readPrisma = new PrismaClient({
     datasources: {
       db: { url: process.env.DATABASE_READ_URL }
     }
   })
   ```

## Multi-Tenant Architecture

The schema implements multi-tenancy through logical separation:

- All tenant-scoped tables include `organization_id` column
- Composite indexes on `(organization_id, ...)` for query performance
- Middleware automatically filters queries by organization context
- No Row-Level Security (RLS) - isolation enforced at application layer

### Using Multi-Tenant Prisma Client

```typescript
import { getPrismaWithOrganization } from '@/lib/prisma-middleware'

// In API routes, get organization from session
const organizationId = session.user.organizationId
const prisma = getPrismaWithOrganization(organizationId)

// All queries automatically filtered by organization
const projects = await prisma.project.findMany()
```

## Schema Management

### Creating Migrations

```bash
# Create a new migration
npx prisma migrate dev --name description_of_changes

# Apply migrations to production
npx prisma migrate deploy
```

### Generating Prisma Client

After schema changes:
```bash
npx prisma generate
```

### Database Seeding

Create a seed file at `prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed data here
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Run seeding:
```bash
npx prisma db seed
```

## Useful Commands

```bash
# Open Prisma Studio (database GUI)
npx prisma studio

# Validate schema
npx prisma validate

# Format schema file
npx prisma format

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View migration status
npx prisma migrate status

# Pull schema from existing database
npx prisma db pull

# Push schema without migrations (dev only)
npx prisma db push
```

## Performance Optimization

### Indexes

The schema includes optimized indexes for:
- Multi-tenant queries: `(organization_id, ...)`
- Foreign key lookups
- Common filter fields (status, priority, severity)

### Query Optimization

1. **Use select to limit fields**:
```typescript
const projects = await prisma.project.findMany({
  select: { id: true, name: true, status: true }
})
```

2. **Use include carefully**:
```typescript
// Good: Only include what you need
const project = await prisma.project.findUnique({
  where: { id },
  include: { workItems: { where: { status: 'IN_PROGRESS' } } }
})
```

3. **Batch operations**:
```typescript
// Use createMany for bulk inserts
await prisma.workItem.createMany({
  data: workItems
})
```

## Troubleshooting

### Connection Issues

1. Check DATABASE_URL format
2. Verify RDS security group allows connections
3. Confirm RDS instance is running
4. Test connection with MySQL client:
   ```bash
   mysql -h your-rds-endpoint.us-east-1.rds.amazonaws.com -u username -p
   ```

### Migration Issues

1. Check migration status: `npx prisma migrate status`
2. Resolve failed migrations: `npx prisma migrate resolve`
3. For production, always use `migrate deploy`, never `migrate dev`

### Performance Issues

1. Enable query logging: Set `log: ['query']` in PrismaClient
2. Analyze slow queries in RDS Performance Insights
3. Check connection pool exhaustion in CloudWatch metrics
4. Consider adding indexes for frequently filtered fields
