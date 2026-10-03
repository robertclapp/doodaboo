import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// /.well-known/openid-configuration, /.well-known/jwks.json and the OAuth /
// magic-link callbacks Convex Auth needs. Password sign-in itself goes
// through the `auth:signIn` action, not HTTP.
auth.addHttpRoutes(http);

export default http;
