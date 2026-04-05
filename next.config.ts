import type { NextConfig } from "next";

/**
 * Security headers applied to every route.
 *
 * CSP deliberately omits script-src / style-src directives because Next.js
 * App Router with Server Components requires unsafe-eval / unsafe-inline for
 * hydration and inline styles — adding a full script CSP without a nonce
 * strategy would either break the app or provide a false sense of security.
 * The high-value defences (frame-ancestors, MIME sniffing, referrer, HSTS)
 * are all covered here.
 *
 * TODO: Implement nonce-based CSP for script-src once Next.js middleware
 *       nonce support is stable (tracked in Next.js #49569).
 */
const SECURITY_HEADERS = [
  // Prevents the app from being embedded in an iframe (clickjacking defence).
  { key: "X-Frame-Options", value: "DENY" },
  // Redundant with X-Frame-Options but covers newer browsers via CSP.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Prevent browsers from MIME-sniffing a response away from the declared content-type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Downgrade referrer information when navigating to external sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Enforce HTTPS for 1 year including subdomains (safe in dev; no practical effect over HTTP).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Disable browser feature APIs not used by this app.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
