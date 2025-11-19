import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { setCookie, getCookies, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cookies = getCookies(req.headers);
  const sessionUser = cookies.user_session || null;

  // --- ROUTING ---

  if (url.pathname === "/login") return serveFile(req, "./static/login.html");
  
  // Protected Pages (Login မဝင်ရင် Login page ကိုမောင်းထုတ်မယ်)
  if ((url.pathname === "/" || url.pathname === "/admin") && !sessionUser) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }

  if (url.pathname === "/") return serveFile(req, "./static/index.html");
  
  // Admin Check (ရိုးရိုး user ဝင်မရအောင် ဒီမှာစစ်ရမယ် - လောလောဆယ်တော့ login ဝင်ရင်ရပြီထားမယ်)
  if (url.pathname === "/admin") return serveFile(req, "./static/admin.html");
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // --- API: AUTH ---

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await req.json();
    const u = body.username.toLowerCase();
    
    // Check if exists
    const check = await kv.get(["users", u]);
    if (check.value) return new Response("Exists", { status: 400 });

    // Create User (Balance 0)
    await kv.set(["users", u], { username: u, password: body.password, balance: 0 });
    return new Response("Created");
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const user = await kv.get(["users", u]);

    if (!user.value || user.value.password !== body.password) {
      return new Response("Fail", { status: 401 });
    }

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

  // --- API: SHOP & ITEMS ---

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
    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  }

  // --- API: ADMIN TOPUP ---
  
  if (req.method === "POST" && url.pathname === "/api/admin/topup") {
    const body = await req.json(); // { username: "user1", amount: 5000 }
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
    for await (const entry of entries) {
      users.push(entry.value);
    }
    return new Response(JSON.stringify(users), { headers: { "content-type": "application/json" } });
  }

  // --- API: BUY (With Balance Check) ---

  if (req.method === "POST" && url.pathname === "/api/buy") {
    if (!sessionUser) return new Response(JSON.stringify({ error: "Please Login" }), { status: 401 });

    const body = await req.json();
    const itemId = body.itemName.replace(/\s+/g, '_').toLowerCase();

    // 1. Get Item
    const itemRes = await kv.get(["items", itemId]);
    if (!itemRes.value) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
    const item = itemRes.value;

    // 2. Check Stock
    if (item.stock.length === 0) return new Response(JSON.stringify({ error: "Out of Stock!" }), { status: 400 });

    // 3. Get User
    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;

    // 4. Check Balance
    const price = parseInt(item.price.replace(/[^0-9]/g, '')); // "3500 MMK" -> 3500
    if (user.balance < price) {
      return new Response(JSON.stringify({ error: "Insufficient Balance! (ပိုက်ဆံမလောက်ပါ)" }), { status: 400 });
    }

    // 5. Process Transaction
    const code = item.stock[0];
    item.stock = item.stock.slice(1);
    user.balance -= price;

    await kv.set(["items", itemId], item);
    await kv.set(["users", sessionUser], user);

    return new Response(JSON.stringify({ success: true, code: code, newBalance: user.balance }), {
      headers: { "content-type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
});
