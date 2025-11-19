import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";

const kv = await Deno.openKv();

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    return serveFile(req, "./static/index.html");
  }

  if (url.pathname === "/admin") {
    return serveFile(req, "./static/admin.html");
  }

  if (url.pathname.startsWith("/static/")) {
    return serveFile(req, "." + url.pathname);
  }

  if (req.method === "POST" && url.pathname === "/api/add-item") {
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    await kv.set(["items", id], item);
    return new Response("Added");
  }

  if (url.pathname === "/api/items") {
    const entries = kv.list({ prefix: ["items"] });
    const items = [];
    for await (const entry of entries) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items), {
      headers: { "content-type": "application/json" }
    });
  }

  // NEW: Buy Logic
  if (req.method === "POST" && url.pathname === "/api/buy") {
    const body = await req.json();
    const id = body.itemName.replace(/\s+/g, '_').toLowerCase();
    
    const result = await kv.get(["items", id]);
    if (!result.value) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });

    const item = result.value;

    if (item.stock.length === 0) {
      return new Response(JSON.stringify({ error: "Out of Stock!" }), { status: 400 });
    }

    const purchasedCode = item.stock[0];
    item.stock = item.stock.slice(1); // Remove first code
    
    await kv.set(["items", id], item);

    return new Response(JSON.stringify({ success: true, code: purchasedCode }), {
      headers: { "content-type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
});
