import { serveFile } from "npm:jsr/@std/http/file-server";

Deno.serve((req) => {
  const url = new URL(req.url);

  // Homepage requested -> serve index.html
  if (url.pathname === "/") {
    return serveFile(req, "./static/index.html");
  }

  // Other files (css, images) -> serve from static folder
  if (url.pathname.startsWith("/static/")) {
    return serveFile(req, "." + url.pathname);
  }

  return new Response("Not Found", { status: 404 });
});
