/**
 * Fork (VinneyUK/shelf.nu): open access. With SHELF_OPEN_ACCESS_USER set to a
 * user's email, every request that has no session gets a real session for
 * that user, minted the way Shelf's mobile SSO does (admin magic link,
 * verified at once). So there is no login page, no sign-in after a QR scan,
 * and the session refreshes like any other. The login, join, logout and
 * password pages just go Home.
 *
 * Unset, this middleware does nothing and Shelf's normal login applies.
 */
import { createMiddleware } from "hono/factory";
import { getSession } from "remix-hono/session";
import { mintMobileSessionForUser } from "~/modules/auth/mobile-sso.server";
import { OPEN_ACCESS_USER } from "~/utils/env";
import { Logger } from "~/utils/logger";
import type { FlashData, SessionData } from "./session";
import { authSessionKey } from "./session";

/** Pages that only make sense with a login; sent Home when access is open. */
const AUTH_PAGES =
  /^\/(login|join|logout|forgot-password|reset-password|otp|resend-otp|sso-login)(\.data)?(\/|$)/;

export function openAccess() {
  return createMiddleware(async (c, next) => {
    if (!OPEN_ACCESS_USER) return next();
    const path = new URL(c.req.url).pathname;
    if (AUTH_PAGES.test(path)) return c.redirect("/");
    const session = getSession<SessionData, FlashData>(c);
    if (!session.get(authSessionKey)) {
      try {
        session.set(
          authSessionKey,
          await mintMobileSessionForUser(OPEN_ACCESS_USER)
        );
      } catch (cause) {
        Logger.error({
          cause,
          message: `Open access: could not sign in ${OPEN_ACCESS_USER}. Does that user exist?`,
          label: "Auth",
        });
      }
    }
    return next();
  });
}
