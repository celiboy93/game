import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";

Deno.serve((req) => {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    return serveFile(req, "./static/index.html");
  }

  if (url.pathname.startsWith("/static/")) {
    return serveFile(req, "." + url.pathname);
  }

  return new Response("Not Found", { status: 404 });
});
