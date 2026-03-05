/**
 * Quick script to generate a JWT token for testing the Apify service.
 * Usage: node scripts/generate-token.js
 */
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pLzD6VilXqWaZx41DfW6hBITkBJP79jpcPXzmXpXUwH");

const token = await new SignJWT({ userId: "test-user", email: "test@signaldesk.ai" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("7d")
  .sign(secret);

console.log("\n=== JWT Token (valid for 7 days) ===\n");
console.log(token);
console.log("\n=== Copy this into apify-service/.env as BACKEND_AUTH_TOKEN ===\n");
