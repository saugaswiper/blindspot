/**
 * Canonical public address and identity for Blindspot.
 *
 * The only live address is the Vercel production URL. `blindspot-sr.dev` appeared in
 * older code but was never registered (NXDOMAIN), so links and identifiers pointing at
 * it were dead. When a custom domain is added, set NEXT_PUBLIC_APP_URL in Vercel and
 * every link, footer and User-Agent below follows it.
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://blindspot-beta.vercel.app"
).replace(/\/+$/, "");

export const APP_HOST = new URL(APP_URL).host;

/** How Blindspot identifies itself to third-party APIs (PROSPERO, OSF, INPLASY, OpenAlex). */
export const USER_AGENT = `Blindspot (${APP_HOST})`;

/** User-Agent with an optional contact address (some registries ask for one). */
export function userAgent(contact?: string): string {
  return contact ? `Blindspot (${APP_HOST}; ${contact})` : USER_AGENT;
}
