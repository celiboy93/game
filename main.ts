import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { setCookie, getCookies, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_USERNAME = "admin"; 

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cookies = getCookies(req.headers);
  const sessionUser = cookies.user_session || null;

  // --- SECURITY CHECK FOR ADMIN PAGES ---
  if (url.pathname === "/admin" || url.pathname.startsWith("/static/admin.html")) {
    if (sessionUser !== ADMIN_USERNAME) {
      return new Response("Access Denied: You are not an Admin.", { status: 403 });
    }
  }

  if (url.pathname.startsWith("/api/admin/")) {
    if (sessionUser !== ADMIN_USERNAME) {
      return new Response("Unauthorized", { status: 403 });
    }
  }

  // --- PUBLIC ROUTING ---
  if (url.pathname === "/login") return serveFile(req, "./static/login.html");

  if ((url.pathname === "/" || url.pathname === "/admin") && !sessionUser) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }

  if (url.pathname === "/") return serveFile(req, "./static/index.html");
  if (url.pathname === "/admin") return serveFile(req, "./static/admin.html");
  
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // --- AUTH API ---
  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const check = await kv.get(["users", u]);
    if (check.value) return new Response("Exists", { status: 400 });
    await kv.set(["users", u], { username: u, password: body.password, balance: 0 });
    return new Response("Created");
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const user = await kv.get(["users", u]);
    if (!user.value || user.value.password !== body.password) return new Response("Fail", { status: 401 });
    const res = new Response("Logged In");
    setCookie(res.headers, { name: "user_session", value: u, path: "/", maxAge: 86400 });
    return res;
  }

  if (url.pathname === "/api/auth/logout") {
    const res = new Response(null, { status: 302, headers: { Location: "/login" } });
    deleteCookie(res.headers, "user_session");
    return res;
  }

  if (url.pathname === "/api/me") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const user = await kv.get(["users", sessionUser]);
    return new Response(JSON.stringify(user.value), { headers: { "content-type": "application/json" } });
  }

  // --- SHOP API ---
  if (req.method === "POST" && url.pathname === "/api/add-item") {
    // Double check admin here too
    if (sessionUser !== ADMIN_USERNAME) return new Response("Unauthorized", { status: 403 });
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    await kv.set(["items", id], item);
    return new Response("Added");
  }

  if (url.pathname === "/api/items") {
    const entries = kv.list({ prefix: ["items"] });
    const items = [];
    for await (const entry of entries) items.push(entry.value);
    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  }

  // --- ADMIN API ---
  if (req.method === "POST" && url.pathname === "/api/admin/topup") {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    if (!userRes.value) return new Response("User not found", { status: 404 });
    const user = userRes.value;
    user.balance += parseInt(body.amount);
    await kv.set(["users", u], user);
    return new Response("Topup Success");
  }

  if (url.pathname === "/api/admin/users") {
    const entries = kv.list({ prefix: ["users"] });
    const users = [];
    for await (const entry of entries) users.push(entry.value);
    return new Response(JSON.stringify(users), { headers: { "content-type": "application/json" } });
  }

  // --- HISTORY API ---
  if (url.pathname === "/api/history") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const entries = kv.list({ prefix: ["history", sessionUser] });
    const history = [];
    for await (const entry of entries) history.push(entry.value);
    return new Response(JSON.stringify(history.reverse()), { headers: { "content-type": "application/json" } });
  }

  // --- BUY API ---
  if (req.method === "POST" && url.pathname === "/api/buy") {
    if (!sessionUser) return new Response(JSON.stringify({ error: "Login Required" }), { status: 401 });

    const body = await req.json();
    const itemId = body.itemName.replace(/\s+/g, '_').toLowerCase();
    
    const itemRes = await kv.get(["items", itemId]);
    if (!itemRes.value) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
    let item = itemRes.value;

    if (item.stock.length === 0) return new Response(JSON.stringify({ error: "Out of Stock!" }), { status: 400 });

    const userRes = await kv.get(["users", sessionUser]);
    let user = userRes.value;
    const price = parseInt(item.price.replace(/[^0-9]/g, ''));

    if (user.balance < price) return new Response(JSON.stringify({ error: "Insufficient Balance" }), { status: 400 });

    const purchasedCode = item.stock[0];
    item.stock = item.stock.slice(1);
    user.balance -= price;

    await kv.set(["items", itemId], item);
    await kv.set(["users", sessionUser], user);

    const record = {
      itemName: item.name,
      code: purchasedCode,
      price: item.price,
      date: new Date().toLocaleString()
    };
    await kv.set(["history", sessionUser, Date.now()], record);

    return new Response(JSON.stringify({ success: true, code: purchasedCode }), {
      headers: { "content-type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
});
