import { google } from "googleapis";
import { getServiceAccountCredentials } from "@/lib/google-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/seo/debug
 * Quick diagnostic: tests GA4 and Ahrefs connectivity without writing to DB.
 */
export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Check env vars
  results.env = {
    GSC_SERVICE_ACCOUNT_JSON: process.env.GSC_SERVICE_ACCOUNT_JSON ? "SET" : "NOT SET",
    GSC_SITE_URL: process.env.GSC_SITE_URL || "NOT SET",
    GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID || "NOT SET",
    AHREFS_API_KEY: process.env.AHREFS_API_KEY ? "SET" : "NOT SET",
  };

  // 2. Check service account
  try {
    const creds = getServiceAccountCredentials();
    results.serviceAccount = {
      email: creds.client_email,
      projectId: creds.project_id,
    };
  } catch (err) {
    results.serviceAccount = { error: err instanceof Error ? err.message : String(err) };
  }

  // 3. Test GA4
  try {
    const creds = getServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });

    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      results.ga4 = { error: "GA4_PROPERTY_ID not set" };
    } else {
      const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (analyticsdata.properties as any).runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "sessions" }],
          limit: 3,
        },
      });
      const rowCount = res.data.rows?.length || 0;
      results.ga4 = {
        status: "OK",
        rowsReturned: rowCount,
        samplePaths: (res.data.rows || []).slice(0, 3).map(
          (r: { dimensionValues?: Array<{ value?: string }> }) => r.dimensionValues?.[0]?.value
        ),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.ga4 = {
      error: msg,
      hint: msg.includes("has not been used") ? "Analytics Data API not enabled in Google Cloud console"
        : msg.includes("permission") ? "Service account not added as Viewer in GA4 property"
        : msg.includes("PERMISSION_DENIED") ? "Service account not added as Viewer in GA4 property"
        : "Unknown error — check service account email and GA4 property ID",
    };
  }

  // 4. Test Ahrefs
  try {
    const apiKey = process.env.AHREFS_API_KEY;
    if (!apiKey) {
      results.ahrefs = { error: "AHREFS_API_KEY not set" };
    } else {
      const today = new Date().toISOString().split("T")[0];
      const url = `https://api.ahrefs.com/v3/site-explorer/domain-rating?target=sequel.io&date=${today}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const body = await res.text();
        results.ahrefs = {
          error: `HTTP ${res.status}`,
          response: body.slice(0, 500),
          hint: res.status === 401 ? "API key is invalid or expired"
            : res.status === 403 ? "API key doesn't have permission for this endpoint"
            : res.status === 404 ? "Endpoint not found — check Ahrefs API version"
            : "Check API key and subscription",
        };
      } else {
        const data = await res.json();
        results.ahrefs = {
          status: "OK",
          domainRating: data.domain_rating?.domain_rating,
          ahrefsRank: data.domain_rating?.ahrefs_rank,
        };
      }
    }
  } catch (err) {
    results.ahrefs = { error: err instanceof Error ? err.message : String(err) };
  }

  // 5. Test Ahrefs additional endpoints (backlinks-stats, url-rating)
  if (process.env.AHREFS_API_KEY) {
    const apiKey = process.env.AHREFS_API_KEY;
    const today = new Date().toISOString().split("T")[0];
    const extraEndpoints: Record<string, string> = {
      "backlinks-stats": `https://api.ahrefs.com/v3/site-explorer/backlinks-stats?target=sequel.io&mode=domain&date=${today}`,
      "metrics": `https://api.ahrefs.com/v3/site-explorer/metrics?target=sequel.io&mode=domain&date=${today}`,
      "backlinks-stats-page": `https://api.ahrefs.com/v3/site-explorer/backlinks-stats?target=https://sequel.io/&mode=exact&date=${today}`,
    };

    const ahrefsEndpoints: Record<string, unknown> = {};
    for (const [name, url] of Object.entries(extraEndpoints)) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          ahrefsEndpoints[name] = { status: res.status, error: body.slice(0, 300) };
        } else {
          const data = await res.json();
          ahrefsEndpoints[name] = { status: "OK", data };
        }
      } catch (err) {
        ahrefsEndpoints[name] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    results.ahrefs_endpoints = ahrefsEndpoints;
  }

  return Response.json(results, { status: 200 });
}
