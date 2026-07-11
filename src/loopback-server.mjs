import { createServer } from "node:http";

const HOST = "127.0.0.1";

function responseBody(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(String(value ?? ""), "utf8");
}

function writePlainResponse(response, statusCode, message, extraHeaders = {}) {
  const body = responseBody(message);
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(body);
}

export function validateLoopbackPort(port = 0, serverName = "loopback server") {
  const requestedPort = Number(port);
  if (
    typeof port === "boolean" ||
    !Number.isInteger(requestedPort) ||
    requestedPort < 0 ||
    requestedPort > 65535
  ) {
    throw new Error(`Invalid ${serverName} port: ${port}`);
  }
  return requestedPort;
}

export async function startLoopbackServer({
  port = 0,
  serverName = "loopback server",
  routes = {},
  contentSecurityPolicy = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
} = {}) {
  const requestedPort = validateLoopbackPort(port, serverName);
  const routeMap = routes instanceof Map ? routes : new Map(Object.entries(routes));

  const server = createServer((request, response) => {
    const method = request.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      writePlainResponse(response, 405, "Method Not Allowed\n", { Allow: "GET, HEAD" });
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url || "/", `http://${HOST}`).pathname;
    } catch {
      writePlainResponse(response, 400, "Bad Request\n");
      return;
    }

    if (pathname === "/favicon.ico" && !routeMap.has(pathname)) {
      response.writeHead(204, {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      });
      response.end();
      return;
    }

    const route = routeMap.get(pathname);
    if (!route) {
      writePlainResponse(response, 404, "Not Found\n");
      return;
    }

    try {
      const resolvedRoute = typeof route === "function" ? route(request) : route;
      const body = responseBody(resolvedRoute.body);
      response.writeHead(resolvedRoute.statusCode || 200, {
        "Content-Type": resolvedRoute.contentType || "application/octet-stream",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "Content-Security-Policy": contentSecurityPolicy,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        ...(resolvedRoute.headers || {})
      });
      if (method === "HEAD") response.end();
      else response.end(body);
    } catch {
      writePlainResponse(response, 500, "Internal Server Error\n");
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => rejectPromise(error);
    server.once("error", onError);
    server.listen(requestedPort, HOST, () => {
      server.off("error", onError);
      resolvePromise();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error(`${serverName} did not expose a TCP port.`);
  }

  const url = `http://${HOST}:${address.port}/`;
  const close = () => new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
    server.closeIdleConnections?.();
  });

  return {
    server,
    close,
    host: HOST,
    port: address.port,
    url
  };
}
