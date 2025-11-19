import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { setCookie, getCookies, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_USERNAME = "admin"; 

// --- NATIVE HASHING HELPERS ---

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
    const salt = new Uint8array(16);
    crypto.getRandomValues(salt);
    return bufferToHex(salt.buffer);
}

async function hashPassword(password: string): Promise<{hash: string, salt: string}> {
    const salt = generateSalt();
    const data = new TextEncoder().encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return { hash: bufferToHex(hashBuffer), salt: salt };
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const data = new TextEncoder().encode(password + storedSalt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const newHash = bufferToHex(hashBuffer);
    return newHash === storedHash;
}

// --- MAIN SERVER LOGIC ---

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cookies = getCookies(req.headers);
  const sessionUser = cookies.user_session || null;

  // SECURITY & ADMIN CHECK
  if (url.pathname === "/admin" || url.pathname.includes("/static/admin.html")) {
    if (sessionUser !== ADMIN_USERNAME) return new Response("Access Denied: Admins Only", { status: 403 });
  }
  if (url.pathname.includes("/api/admin/")) {
    if (sessionUser !== ADMIN_USERNAME) return new Response("Unauthorized", { status: 403 });
  }

  // ROUTING
  if (url.pathname === "/login") return serveFile(req, "./static/login.html");
  if ((url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/profile") && !sessionUser) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }

  if (url.pathname === "/") return serveFile(req, "./static/index.html");
  if (url.pathname === "/admin") return serveFile(req, "./static/admin.html");
  if (url.pathname === "/profile") return serveFile(req, "./static/profile.html");
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // --- API: AUTH & SHOP (ROBUST PATH CHECKS) ---
  
  if (req.method === "POST" && url.pathname.includes("/api/auth/register")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const check = await kv.get(["users", u]);
    if (check.value) return new Response("Exists", { status: 400 });

    const { hash, salt } = await hashPassword(body.password);
    await kv.set(["users", u], { username: u, hash: hash, salt: salt, balance: 0 });
    return new Response("Created");
  }

  if (req.method === "POST" && url.pathname.includes("/api/auth/login")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    const user = userRes.value;

    if (!user) return new Response("Fail", { status: 401 });

    const passwordMatch = await verifyPassword(body.password, user.hash, user.salt);
    if (!passwordMatch) return new Response("Fail", { status: 401 });

    const res = new Response("Logged In");
    setCookie(res.headers, { name: "user_session", value: u, path: "/", maxAge: 86400 });
    return res;
  }

  if (url.pathname.includes("/api/admin/users")) { // FIX: Use includes
    const entries = kv.list({ prefix: ["users"] });
    const users = [];
    for await (const entry of entries) users.push(entry.value);
    return new Response(JSON.stringify(users), { headers: { "content-type": "application/json" } });
  }

  if (url.pathname.includes("/api/items")) { // FIX: Use includes
    const entries = kv.list({ prefix: ["items"] });
    const items = [];
    for await (const entry of entries) {
        const itemCopy = { ...entry.value };
        itemCopy.stock = itemCopy.stock ? itemCopy.stock.length : 0; 
        items.push(itemCopy);
    }
    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  }
  
  if (url.pathname.includes("/api/history")) { // FIX: Use includes
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const entries = kv.list({ prefix: ["history", sessionUser] });
    const history = [];
    for await (const entry of entries) history.push(entry.value);
    return new Response(JSON.stringify(history.reverse()), { headers: { "content-type": "application/json" } });
  }
  
  // --- REST OF THE API (Unchanged Logic) ---

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

  if (req.method === "POST" && url.pathname === "/api/admin/create-voucher") {
    const body = await req.json();
    await kv.set(["vouchers", body.code], { amount: parseInt(body.amount), limit: parseInt(body.limit), used: 0 });
    return new Response("Voucher Created");
  }

  if (req.method === "POST" && url.pathname === "/api/add-item") {
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    await kv.set(["items", id], item);
    return new Response("Added");
  }

  if (req.method === "POST" && url.pathname === "/api/transfer") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const receiverName = body.receiver.toLowerCase();
    const amount = parseInt(body.amount);

    if (receiverName === sessionUser) return new Response("Cannot send to self", { status: 400 });
    if (amount <= 0) return new Response("Invalid amount", { status: 400 });

    const senderRes = await kv.get(["users", sessionUser]);
    const sender = senderRes.value;
    if (sender.balance < amount) return new Response("Insufficient Balance", { status: 400 });

    const receiverRes = await kv.get(["users", receiverName]);
    if (!receiverRes.value) return new Response("Receiver not found", { status: 404 });
    const receiver = receiverRes.value;

    sender.balance -= amount;
    receiver.balance += amount;

    await kv.set(["users", sessionUser], sender);
    await kv.set(["users", receiverName], receiver);

    return new Response("Transfer Success");
  }
  
  if (req.method === "POST" && url.pathname === "/api/redeem") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const code = body.code;

    const voucherRes = await kv.get(["vouchers", code]);
    if (!voucherRes.value) return new Response("Invalid Voucher", { status: 404 });
    
    const voucher = voucherRes.value;
    if (voucher.used >= voucher.limit) return new Response("Voucher Fully Used", { status: 400 });

    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;
    user.balance += voucher.amount;
    
    voucher.used += 1;

    await kv.set(["users", sessionUser], user);
    await kv.set(["vouchers", code], voucher);

    return new Response(JSON.stringify({ amount: voucher.amount }), { headers: { "content-type": "application/json" } });
  }

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

    return new Response(JSON.stringify({ success: true, code: purchasedCode }), { headers: { "content-type": "application/json" } });
  }

  return new Response("Not Found", { status: 404 });
});
