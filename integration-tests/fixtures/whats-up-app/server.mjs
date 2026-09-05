import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const routes = new Map([
  ["/", ["index.html", "text/html"]],
  ["/next", ["next.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);

/** Stateless fixture server. Only the four declared assets can be read. */
export function createApp() {
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const asset = routes.get(request.url?.split("?")[0]);
    if (!asset) {
      response.writeHead(404).end("Not found");
      return;
    }
    try {
      const content = await readFile(new URL(asset[0], import.meta.url));
      response.writeHead(200, {
        "Content-Type": `${asset[1]}; charset=utf-8`,
        "Cache-Control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      console.error("Could not serve fixture asset:", error);
      response.writeHead(500).end("Unable to load page. Please restart the fixture server.");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { port: { type: "string" }, host: { type: "string" } } });
  const port = Number(values.port ?? process.env.PORT ?? 4259);
  const host = values.host ?? process.env.HOST ?? "127.0.0.1";
  createApp().listen(port, host, () => console.log(`Say hello: http://${host}:${port}`));
}
