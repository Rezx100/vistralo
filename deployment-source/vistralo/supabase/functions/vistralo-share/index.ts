// Answers for a share link. Anyone with the link may open it, so this function takes no Supabase
// token (deploy it with --no-verify-jwt). The link's token is its only key: only its SHA-256 hash
// is stored, and a link that is expired, revoked or for a project in Trash gets the same answer
// as one that never existed.
//
// The page itself is drawn by the app at /watch, which asks here with ?format=json. Supabase's
// gateway turns HTML from a function into plain text, so a browser that opens one of these
// addresses directly (every link made before /watch existed) is sent on to the app's page.
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { SHARE_TOKEN, shareContent, shareJson, shareJsonHeaders, watchUrl } from "../_shared/share-page.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Where links are opened. Only for testing a preview; production links go to the app.
const APP = (Deno.env.get("VISTRALO_SHARE_ORIGIN") || "https://app.vistralo.com").replace(/\/+$/, "");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: shareJsonHeaders });
const unavailable = () => json({ unavailable: true }, 404);

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const url = new URL(req.url);
  const token = url.searchParams.get("t") || "";
  if (url.searchParams.get("format") !== "json") {
    return new Response(null, {
      status: 302,
      headers: { Location: SHARE_TOKEN.test(token) ? watchUrl(APP, token) : `${APP}/watch`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  if (!SHARE_TOKEN.test(token)) return unavailable();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const { data: share, error } = await client
    .from("vistralo_shares")
    .select("project_id,owner_id,expires_at")
    .eq("token_hash", digest)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !share) return unavailable();
  const { data: row } = await client
    .from("vistralo_projects")
    .select("document")
    .eq("id", share.project_id)
    .eq("owner_id", share.owner_id)
    .maybeSingle();
  const content = shareContent(row?.document, share.owner_id, share.project_id);
  if (!content) return unavailable();
  let mediaUrl: string | undefined;
  if (content.file) {
    // An hour: long enough to watch a long walkthrough after opening the page.
    const { data } = await client.storage.from("vistralo-media").createSignedUrl(content.file, 60 * 60);
    mediaUrl = data?.signedUrl;
  }
  if (!mediaUrl && !content.brief) return unavailable();
  return json(shareJson(content, mediaUrl, share.expires_at));
});
