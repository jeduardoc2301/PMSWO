# Prisma Migration Guide

## Overview

This guide explains how to set up and run the initial database migration for the PM SaaS platform using Prisma with MySQL 8.4.

## Prerequisites

- MySQL 8.4 database instance (AWS RDS or local)
- Node.js 18+ installed
- Database credentials

## Configuration

### 1. Environment Variables

Create a `.env` file in the project root with your database connection string:

```env
DATABASE_URL="mysql://username:password@host:3306/database_name"
```

For AWS RDS MySQL 8.4 with connection pooling:

```env
DATABASE_URL="mysql://username:password@your-rds-endpoint.us-east-1.rds.amazonaws.com:3306/pm_saas?connection_limit=15&pool_timeout=20&connect_timeout=10"
```

### 2. Prisma Configuration (Prisma 7)

The project uses Prisma 7, which has a different configuration approach:

- **Schema file**: `prisma/schema.prisma` - Contains the database schema without the `url` property
- **Config file**: `prisma/prisma.config.ts` - Contains the datasource URL configuration

The `prisma.config.ts` file should look like this:

```typescript
export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
}
```

## Database Schema

The schema includes 12 models for the multi-tenant SaaS platform:

1. **Organization** - Tenant organizations
2. **User** - Users with role-based access control
3. **Project** - Projects with Kanban boards
4. **KanbanColumn** - Kanban board columns
5. **WorkItem** - Tasks and work items
6. **WorkItemChange** - Audit log for work item changes
7. **Blocker** - Blockers affecting work items
8. **Risk** - Project risks
9. **Agreement** - Agreements and commitments
10. **AgreementWorkItem** - Many-to-many relationship
11. **AgreementNote** - Progress notes for agreements
12. **AIAnalysisCache** - Cached AI analysis results

### Key Features

- **Multi-tenancy**: All models include `organization_id` for data isolation
- **Composite indexes**: Optimized for multi-tenant queries
- **Cascade deletes**: Proper cleanup of related data
- **JSON fields**: Flexible storage for settings and metadata (MySQL 8.0+ native JSON support)

## Running Migrations

### Option 1: Using Prisma Migrate (Recommended)

If you have a running database:

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npx prisma migrate deploy --url="your-database-url"
```

### Option 2: Manual Migration

If you encounter SSL certificate issues or connection problems:

1. The migration SQL file is already created at: `prisma/migrations/20250101000000_init/migration.sql`
2. Connect to your MySQL database using your preferred client
3. Run the SQL file manually:

```bash
mysql -h your-host -u your-user -p your-database < prisma/migrations/20250101000000_init/migration.sql
```

Or using MySQL Workbench, DBeaver, or any other MySQL client.

## Seeding the Database

After running the migration, seed the database with test data:

### Prerequisites

Install tsx for running TypeScript files:

```bash
npm install -D tsx
```

### Update Seed File

Before running the seed, update `prisma/seed.ts` to use actual bcrypt hashed passwords:

```typescript
// Install bcrypt
npm install bcrypt
npm install -D @types/bcrypt

// Generate a hash
import bcrypt from 'bcrypt'
const hash = await bcrypt.hash('password123', 10)
```

### Run Seed

```bash
npm run prisma:seed
```

This will create:
- 1 test organization
- 4 test users with different roles:
  - admin@test.com (ADMIN, PROJECT_MANAGER)
  - pm@test.com (PROJECT_MANAGER)
  - consultant@test.com (INTERNAL_CONSULTANT)
  - executive@test.com (EXECUTIVE)

## Troubleshooting

### SSL Certificate Issues

If you encounter SSL certificate errors when connecting to AWS RDS:

```bash
# Temporary workaround (development only)
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'
npx prisma generate
```

For production, download the RDS CA certificate:

```bash
# Download RDS CA bundle
curl -o rds-ca-2019-root.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# Update DATABASE_URL
DATABASE_URL="mysql://user:pass@host:3306/db?sslcert=./rds-ca-2019-root.pem"
```

### Connection Issues

If you can't connect to the database:

1. Check security group rules (port 3306 must be open)
2. Verify database credentials
3. Ensure the database exists
4. Check network connectivity

### Prisma 7 Configuration Issues

If you see errors about datasource URL:

1. Ensure `prisma.config.ts` exists with the correct format
2. Remove `url` property from `datasource db` block in `schema.prisma`
3. Use `--url` flag to override: `npx prisma migrate dev --url="your-url"`

## Verifying the Setup

After migration and seeding:

```bash
# Open Prisma Studio to view data
npm run prisma:studio
```

This will open a web interface at `http://localhost:5555` where you can browse the database.

## Next Steps

1. Update the seed file with real bcrypt hashed passwords
2. Run the migration on your database
3. Seed the database with test data
4. Verify the setup using Prisma Studio
5. Proceed to Task 3: Authentication and authorization system

## Important Notes

- **Multi-tenant Isolation**: All queries must filter by `organization_id`
- **Roles Field**: Changed from `String[]` to `Json` for MySQL compatibility
- **UUID Generation**: Uses `uuid()` function for primary keys
- **Date Fields**: Uses MySQL `DATE` type for date-only fields
- **JSON Support**: Requires MySQL 8.0+ for native JSON support

## Schema Changes

If you need to modify the schema:

1. Update `prisma/schema.prisma`
2. Create a new migration: `npx prisma migrate dev --name your_migration_name`
3. Apply to production: `npx prisma migrate deploy`

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma 7 Migration Guide](https://www.prisma.io/docs/guides/upgrade-guides/upgrading-versions/upgrading-to-prisma-7)
- [MySQL 8.4 Documentation](https://dev.mysql.com/doc/refman/8.4/en/)
- [AWS RDS MySQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_MySQL.html)
