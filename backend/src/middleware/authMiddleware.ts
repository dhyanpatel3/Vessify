import { MiddlewareHandler } from "hono";
import { auth } from "../auth.js";
import { prisma } from "../db.js";

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const headers = new Headers(c.req.raw.headers);
    
    // Better Auth's Bearer plugin intercepts this and resolves the session
    const sessionResult = await auth.api.getSession({
      headers,
    });

    if (!sessionResult || !sessionResult.session) {
      return c.json({ error: "Unauthorized: Invalid or missing session token" }, 401);
    }

    const { user, session } = sessionResult;

    // Find the first organization the user belongs to
    const member = await prisma.member.findFirst({
      where: { userId: user.id },
    });

    if (!member) {
      return c.json({ error: "Forbidden: User is not associated with any organization" }, 403);
    }

    // Set variable properties in request context
    c.set("user", user);
    c.set("session", session);
    c.set("organizationId", member.organizationId);

    await next();
  };
};
