# Plataforma SaaS de Gestión de Proyectos Ejecutiva

Multi-tenant SaaS platform for executive project management using Kanban methodology, powered by AI to reduce administrative burden for Project Managers and consultants.

## Tech Stack

- **Frontend/Backend**: Next.js 14+ (App Router) with TypeScript
- **Database**: MySQL 8.4 with Prisma ORM
- **Authentication**: NextAuth.js v5
- **AI**: AWS Bedrock (Claude 3)
- **UI**: Tailwind CSS + shadcn/ui
- **i18n**: next-intl (Spanish/Portuguese)

## Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8.4+
- AWS Account (for Bedrock)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env` and configure your environment variables:

```bash
cp .env.example .env
```

4. Set up the database:

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

**Note**: If you encounter SSL certificate errors with Prisma, see [docs/PRISMA_SETUP.md](docs/PRISMA_SETUP.md) for solutions.

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Project Structure

```
├── app/              # Next.js App Router pages and layouts
├── components/       # React components
│   └── ui/          # shadcn/ui components
├── lib/             # Utility functions and configurations
├── services/        # Business logic and service layer
├── types/           # TypeScript type definitions
├── hooks/           # Custom React hooks
└── prisma/          # Database schema and migrations
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - Run TypeScript type checking
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations (dev)
- `npm run prisma:migrate:deploy` - Deploy migrations (production)
- `npm run prisma:studio` - Open Prisma Studio (database GUI)
- `npm run prisma:validate` - Validate Prisma schema
- `npm run prisma:format` - Format Prisma schema

## Features

- ✅ Multi-tenant architecture with data isolation
- ✅ MySQL 8.4 database with Prisma ORM
- ✅ Connection pooling optimized for AWS RDS
- ✅ Multi-tenant middleware for automatic data filtering
- ⏭️ Kanban board for project management
- ⏭️ Work item tracking with change history
- ⏭️ Blocker and risk management
- ⏭️ Agreement tracking
- ⏭️ AI-powered project analysis and reporting (AWS Bedrock)
- ⏭️ Executive dashboard with real-time metrics
- ⏭️ Internationalization (Spanish/Portuguese)
- ⏭️ Role-based access control (RBAC)
- ⏭️ Authentication with NextAuth.js v5

## Documentation

- [Prisma Setup Guide](docs/PRISMA_SETUP.md) - Detailed database setup, configuration, and troubleshooting
- [Prisma Schema Documentation](prisma/README.md) - Database schema reference and operations

## License

Private - All rights reserved
