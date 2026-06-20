import { jest } from "@jest/globals";
import app from "../src/index.js";
import { auth } from "../src/auth.js";
import { prisma } from "../src/db.js";

// Mock auth and prisma modules
jest.mock("../src/auth.js", () => {
  return {
    auth: {
      api: {
        signUpEmail: jest.fn(),
        signInEmail: jest.fn(),
        getSession: jest.fn(),
      },
      handler: jest.fn(),
    },
  };
});

jest.mock("../src/db.js", () => {
  return {
    prisma: {
      organization: {
        create: jest.fn(),
      },
      member: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    },
  };
});

describe("Hono Backend API Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    test("successfully registers user and creates an organization", async () => {
      const mockSignUpResult = {
        user: { id: "user_123", email: "test@example.com", name: "Test User" },
        token: "session_token_123",
      };

      (auth.api.signUpEmail as any).mockResolvedValue(mockSignUpResult);
      (prisma.organization.create as any).mockResolvedValue({ id: "org_123" });
      (prisma.member.create as any).mockResolvedValue({ id: "member_123" });

      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
          name: "Test User",
          organizationName: "Test Org",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty("user");
      expect(body.user.id).toBe("user_123");
      expect(body).toHaveProperty("session");
      expect(body.session.token).toBe("session_token_123");
      expect(body).toHaveProperty("organizationId");
      expect(prisma.organization.create).toHaveBeenCalled();
      expect(prisma.member.create).toHaveBeenCalled();
    });

    test("fails if mandatory fields are missing", async () => {
      const res = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Name, email and password are required");
    });
  });

  describe("POST /api/auth/login", () => {
    test("successfully logs in and returns session token + organizationId", async () => {
      const mockSignInResult = {
        user: { id: "user_123", email: "test@example.com", name: "Test User" },
        token: "session_token_123",
      };

      (auth.api.signInEmail as any).mockResolvedValue(mockSignInResult);
      (prisma.member.findFirst as any).mockResolvedValue({ organizationId: "org_123" });

      const res = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.token).toBe("session_token_123");
      expect(body.organizationId).toBe("org_123");
    });
  });

  describe("Protected routes and Data Isolation", () => {
    const userA = { id: "user_A", email: "userA@example.com", name: "User A" };
    const sessionA = { token: "token_A" };
    const orgAId = "org_A_id";

    const userB = { id: "user_B", email: "userB@example.com", name: "User B" };
    const sessionB = { token: "token_B" };
    const orgBId = "org_B_id";

    beforeEach(() => {
      // Mock auth.api.getSession to check the token and return the appropriate user
      (auth.api.getSession as any).mockImplementation(async ({ headers }: { headers: Headers }) => {
        const authHeader = headers.get("authorization");
        if (authHeader === "Bearer token_A") {
          return { user: userA, session: sessionA };
        } else if (authHeader === "Bearer token_B") {
          return { user: userB, session: sessionB };
        }
        return null;
      });

      // Mock prisma.member.findFirst to return the appropriate org id
      (prisma.member.findFirst as any).mockImplementation(async ({ where }: any) => {
        if (where.userId === "user_A") {
          return { organizationId: orgAId };
        } else if (where.userId === "user_B") {
          return { organizationId: orgBId };
        }
        return null;
      });
    });

    test("POST /api/transactions/extract - parses and saves transaction scoped to correct user and organization", async () => {
      (prisma.transaction.create as any).mockImplementation(async ({ data }: any) => {
        return { id: "tx_1", ...data };
      });

      const res = await app.request("/api/transactions/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer token_A",
        },
        body: JSON.stringify({
          text: `Date: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18,420.50`,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.transaction.userId).toBe("user_A");
      expect(body.transaction.organizationId).toBe(orgAId);
      expect(body.transaction.amount).toBe(-420);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user_A",
            organizationId: orgAId,
            amount: -420,
          }),
        })
      );
    });

    test("GET /api/transactions - enforces data isolation between User A and User B", async () => {
      // Setup mock data for User A
      const transactionsA = [{ id: "tx_a1", amount: -420, organizationId: orgAId }];
      (prisma.transaction.findMany as any).mockImplementation(async ({ where }: any) => {
        if (where.organizationId === orgAId) {
          return transactionsA;
        } else if (where.organizationId === orgBId) {
          return [];
        }
        return [];
      });

      // Call transactions as User A
      const resA = await app.request("/api/transactions", {
        method: "GET",
        headers: {
          "Authorization": "Bearer token_A",
        },
      });

      expect(resA.status).toBe(200);
      const bodyA = await resA.json();
      expect(bodyA.transactions).toHaveLength(1);
      expect(bodyA.transactions[0].organizationId).toBe(orgAId);

      // Verify Prisma was queried with the correct scoping filters
      expect(prisma.transaction.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgAId,
          }),
        })
      );

      // Call transactions as User B
      (prisma.transaction.findMany as any).mockImplementation(async ({ where }: any) => {
        if (where.organizationId === orgBId) {
          return [{ id: "tx_b1", amount: -1250, organizationId: orgBId }];
        }
        return [];
      });

      const resB = await app.request("/api/transactions", {
        method: "GET",
        headers: {
          "Authorization": "Bearer token_B",
        },
      });

      expect(resB.status).toBe(200);
      const bodyB = await resB.json();
      expect(bodyB.transactions).toHaveLength(1);
      expect(bodyB.transactions[0].organizationId).toBe(orgBId);
      expect(prisma.transaction.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgBId,
          }),
        })
      );
    });

    test("GET /api/transactions - cursor-based pagination works correctly", async () => {
      const mockTxList = [
        { id: "tx_1", amount: -100, organizationId: orgAId },
        { id: "tx_2", amount: -200, organizationId: orgAId },
        { id: "tx_3", amount: -300, organizationId: orgAId },
      ];

      (prisma.transaction.findMany as any).mockResolvedValue(mockTxList);

      const res = await app.request("/api/transactions?limit=2", {
        method: "GET",
        headers: {
          "Authorization": "Bearer token_A",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.transactions).toHaveLength(2); // Popped the 3rd one
      expect(body.transactions[0].id).toBe("tx_1");
      expect(body.nextCursor).toBe("tx_3");
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3, // limit + 1
        })
      );
    });
  });
});
