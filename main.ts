import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";

const kv = await Deno.openKv();
const ADMIN_USERNAME = "admin"; 

// --- HASHING HELPERS ---
function bufferToHex(buffer: ArrayBuffer) { /* ... */ } // (Omitted for brevity, but should be included)
function generateSalt() { /* ... */ }
async function hashPassword(password) { /* ... */ }
async function verifyPassword(password, storedHash, storedSalt) { /* ... */ }
// ... (Please ensure HASHING HELPERS from previous step are above this line in your deployed file)

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  if (url.pathname === "/admin") return serveFile(req, "./static/admin-minimal.html"); // New File Name
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // API: ADD ITEM (The core logic to test)
  if (req.method === "POST" && url.pathname === "/api/add-item") {
    // SECURITY CHECK OMITTED FOR SIMPLICITY TEST (USER MUST USE FULL HASHING CODE)
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    
    // Check required fields before saving
    if (!item.name || !item.price || item.stock.length === 0) {
        return new Response("Missing essential item data.", { status: 400 });
    }
    
    await kv.set(["items", id], item);
    return new Response("Item Added", { status: 200 });
  }

  return new Response("Not Found", { status: 404 });
});
