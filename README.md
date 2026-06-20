# Multi-Tenant Personal Finance Transaction Extractor

This is a production-realistic personal finance transaction extractor built with proper authentication, authorization, multi-tenancy, and data isolation. It represents the secure, user-scoped architecture patterns utilized at Vessify.

## Tech Stack
- **Backend**: Hono (TypeScript)
- **Frontend**: Next.js 15 (App Router, Server Components)
- **Database**: PostgreSQL (via Prisma ORM)
- **Auth (Backend)**: Better Auth (with Organization, JWT, and Bearer plugins)
- **Auth (Frontend)**: Auth.js (NextAuth.js v5 credentials flow syncing with Better Auth session tokens)
- **UI & Styling**: Vanilla Tailwind CSS + shadcn/ui custom lightweight components

---

## Architectural Approach & Data Isolation

### How Better Auth is Integrated
We use Better Auth as the core authentication engine on our Hono backend. When a user registers (`POST /api/auth/register`), they are assigned a unique user record, and an associated **Organization** (tenant boundary) is automatically provisioned via the `organization` plugin. The user is added as the organization's administrator/owner.

For requests, the frontend communicates using **Auth.js** sessions. The Hono backend interceptor middleware leverages the Better Auth `bearer` plugin to extract and validate the session token directly from the standard `Authorization: Bearer <token>` header.

### Scoping & Scalability (Data Isolation)
1. **Query-level Isolation**: The Hono backend authentication middleware automatically queries the database using Prisma to resolve the user's active organization ID from the `Member` schema mapping. All subsequent database operations (such as transaction creation and paginated queries) strictly append a `where: { organizationId }` filter resolved from this authenticated context. Even if a user attempts to manually request another tenant's ID or change query attributes, they can only see their own organization's records.
2. **Scalability & Indexes**: Database indexes are defined on both `userId`/`organizationId` and `createdAt`/`date` fields in the `Transaction` table. This ensures O(1) page-level retrievals and prevents performance degradation as the database scales to millions of records.
3. **Cursor-Based Pagination**: Endpoints use cursor-based pagination (taking the ID of the last item in the current page) rather than offset-based pagination. This eliminates performance issues associated with large offsets and avoids item duplicates or skips when new transactions are added in real-time.

---

## Getting Started

### 1. Database Setup
Ensure you have a running PostgreSQL database. Create a database named `finance` or whatever you prefer.

### 2. Backend Setup
1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Copy the example env file and update the connection values:
   ```bash
   copy .env.example .env
   ```
   *Modify the `DATABASE_URL` with your Postgres connection string (e.g., `postgresql://postgres:password@localhost:5432/finance`).*
3. Install dependencies and generate the Prisma Client:
   ```bash
   npm install
   npx prisma generate
   ```
4. Run migrations to provision tables:
   ```bash
   npx prisma db push
   ```
5. Start the backend Hono API:
   ```bash
   npm run dev
   ```
   *The backend will boot up at `http://localhost:4000`.*

### 3. Frontend Setup
1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Copy the example env file:
   ```bash
   copy .env.example .env
   ```
   *Ensure `AUTH_SECRET` is set to a secure 32-character string.*
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   *The frontend will run at `http://localhost:3000`.*

---

## Running Automated Tests
The project contains 9 Jest tests covering the transaction parser (validating all three messy sample formats perfectly), auth flows (registration, login, errors), data isolation (asserting User B cannot access User A's data), and cursor pagination.

To run the backend tests:
1. Navigate to the `backend/` directory.
2. Execute the test command:
   ```bash
   npm run test
   ```
   *Tests use mock interfaces and will execute immediately without needing a live PostgreSQL instance.*

---

## Test Credentials & Setup

You can create test accounts by running the app and going to the `/register` page, or use the following pre-planned profiles for testing data isolation:

### Organization A (Tenant A)
- **User**: User A (`usera@vessify.com` / `password123`)
- **Organization**: Workspace Alpha
- **Instructions**: Log in as User A and paste Sample 1 or 2.

### Organization B (Tenant B)
- **User**: User B (`userb@vessify.com` / `password123`)
- **Organization**: Workspace Beta
- **Instructions**: Log in as User B and paste Sample 3. Observe that User B has a clean slate and cannot view any of User A's transactions in their table log, verifying true data isolation.
