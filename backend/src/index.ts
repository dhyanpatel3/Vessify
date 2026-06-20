import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth } from "./auth.js";
import { prisma } from "./db.js";
import { authMiddleware } from "./middleware/authMiddleware.js";
import { parseTransaction } from "./utils/parser.js";
import * as dotenv from "dotenv";

dotenv.config();

type Variables = {
  user: any;
  session: any;
  organizationId: string;
};

const app = new Hono<{ Variables: Variables }>();

// CORS configuration
app.use(
  "/*",
  cors({
    origin: (origin) => origin, // Allow any origin for ease of demo (Next.js is at 3000)
    allowHeaders: ["Content-Type", "Authorization", "x-organization-id"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

// Helper for generating custom IDs
const generateId = (prefix: string) => {
  return `${prefix}_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
};

/**
 * Custom register route
 * Creates user via Better Auth, then creates organization & member links
 */
app.post("/api/auth/register", async (c) => {
  try {
    const { email, password, name, organizationName } = await c.req.json();

    if (!email || !password || !name) {
      return c.json({ error: "Name, email and password are required" }, 400);
    }

    // Call Better Auth register
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!signUpResult || !signUpResult.user) {
      return c.json({ error: "Failed to sign up user" }, 400);
    }

    // Create organization
    const orgId = generateId("org");
    const organization = await prisma.organization.create({
      data: {
        id: orgId,
        name: organizationName || `${name}'s Organization`,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`,
        createdAt: new Date(),
      },
    });

    // Link user to organization as administrator
    await prisma.member.create({
      data: {
        id: generateId("member"),
        organizationId: orgId,
        userId: signUpResult.user.id,
        role: "admin",
        createdAt: new Date(),
      },
    });

    return c.json({
      user: signUpResult.user,
      session: { token: signUpResult.token },
      organizationId: orgId,
    }, 201);
  } catch (err: any) {
    console.error("Registration error:", err);
    return c.json({ error: err.message || "An error occurred during registration" }, 500);
  }
});

/**
 * Custom login route
 * Returns user, session token, and their associated organization ID
 */
app.post("/api/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const signInResult = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    if (!signInResult || !signInResult.token) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    // Get the user's active organization ID
    const member = await prisma.member.findFirst({
      where: { userId: signInResult.user.id },
    });

    return c.json({
      user: signInResult.user,
      session: { token: signInResult.token },
      organizationId: member?.organizationId || null,
    });
  } catch (err: any) {
    console.error("Login error:", err);
    return c.json({ error: err.message || "Invalid credentials" }, 401);
  }
});

// Mount Better Auth's catch-all routes at /api/auth/* AFTER custom routes
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

/**
 * Protected: Parse and Extract transaction from statement
 */
app.post("/api/transactions/extract", authMiddleware(), async (c) => {
  try {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    const { text } = await c.req.json();

    if (!text) {
      return c.json({ error: "Raw statement text is required" }, 400);
    }

    // Parse the transaction details using the regex parser
    const parsed = parseTransaction(text);

    // Save transaction to DB, scoped to current organization and user ID
    const transaction = await prisma.transaction.create({
      data: {
        date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        balance: parsed.balance,
        category: parsed.category,
        rawText: text,
        confidence: parsed.confidence,
        userId: user.id,
        organizationId: organizationId,
      },
    });

    return c.json({
      transaction,
      parsed,
    }, 201);
  } catch (err: any) {
    console.error("Extraction error:", err);
    return c.json({ error: err.message || "An error occurred during parsing" }, 500);
  }
});

/**
 * Protected: Retrieve user's transactions with cursor-based pagination
 */
app.get("/api/transactions", authMiddleware(), async (c) => {
  try {
    const organizationId = c.get("organizationId");
    
    // Get query params
    const cursor = c.req.query("cursor");
    const limitParam = c.req.query("limit");
    const limit = limitParam ? parseInt(limitParam) : 10;

    // Fetch limit + 1 items to see if there is a next page
    const transactions = await prisma.transaction.findMany({
      where: {
        organizationId: organizationId,
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: {
        createdAt: "desc",
      },
    });

    let nextCursor: string | null = null;
    if (transactions.length > limit) {
      const nextItem = transactions.pop();
      nextCursor = nextItem!.id;
    }

    return c.json({
      transactions,
      nextCursor,
    });
  } catch (err: any) {
    console.error("Retrieve transactions error:", err);
    return c.json({ error: err.message || "An error occurred fetching transactions" }, 500);
  }
});

// Start Node server if run directly (not under tests)
if (process.env.NODE_ENV !== "test") {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  console.log(`Server is starting on port ${port}...`);
  serve({
    fetch: app.fetch,
    port,
  });
}

export default app;
