# Max Dental database schema

This folder contains a standalone Prisma representation of the existing Sequelize/PostgreSQL data model.

It is intentionally separate from `backend/prisma`, so it does not change the current backend runtime. The schema maps Prisma names to the underscored columns and plural table names created by Sequelize.

Validate it from `backend` with:

```bash
npx prisma validate --schema database-schema/schema.prisma
```

Generate a client with:

```bash
npx prisma generate --schema database-schema/schema.prisma
```

The datasource URL is supplied by the Prisma CLI configuration/environment; no migration or database changes are performed by these commands.