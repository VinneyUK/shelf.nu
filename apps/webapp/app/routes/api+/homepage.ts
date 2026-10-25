/**
 * /api/homepage (fork): figures for a Homepage (gethomepage.dev) customapi
 * widget, as flat, stable JSON. No login: Homepage fetches it server-side on
 * the LAN. If HOMEPAGE_API_KEY is set, the request must carry it in an
 * X-API-Key header; unset, no key is asked for.
 */
import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  cachedHomepageStats,
  homepageOrganizationId,
} from "~/modules/homepage/stats.server";
import { Logger } from "~/utils/logger";

export async function loader({ request }: LoaderFunctionArgs) {
  const key = process.env.HOMEPAGE_API_KEY?.trim();
  if (key && request.headers.get("x-api-key") !== key)
    return data(
      { error: "A valid X-API-Key header is needed." },
      { status: 401 }
    );
  try {
    const organizationId = await homepageOrganizationId();
    if (!organizationId)
      return data({ error: "No workspace yet." }, { status: 404 });
    return data(await cachedHomepageStats(organizationId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    Logger.error(cause);
    return data({ error: "Couldn't read the figures." }, { status: 500 });
  }
}
