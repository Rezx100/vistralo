// Serves the public page for a share link. Anyone with the link may open it, so this function
// takes no Supabase token (deploy it with --no-verify-jwt). The link's token is its only key:
// only its SHA-256 hash is stored, and a link that is expired, revoked or for a project in
// Trash shows the same "unavailable" page as one that never existed.
import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { shareContent, shareHeaders, sharePage, styleHash, unavailablePage } from "../_shared/share-page.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = shareHeaders(await styleHash());
const unavailable = () => new Response(unavailablePage(), { status: 404, headers });

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return unavailable();
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
  return new Response(sharePage({ ...content, mediaUrl, expiresAt: share.expires_at }), { headers });
});
