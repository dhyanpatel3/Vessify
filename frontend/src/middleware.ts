import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // Run middleware on root and other paths, but skip static assets and login/register pages
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|register).*)"],
};
