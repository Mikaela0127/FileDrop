import { randomBytes } from "node:crypto";

const SMOKE_TIMEOUT_MILLISECONDS = 10_000;
const REQUIRED_SECURITY_HEADERS = [
  ["content-security-policy", "frame-ancestors 'none'"],
  ["referrer-policy", "no-referrer"],
  ["strict-transport-security", "max-age=31536000"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
] as const;

type SmokeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ProductionSmokeDependencies {
  readonly baseUrl: URL;
  readonly fetchImplementation?: SmokeFetch;
  readonly shareToken?: string;
}

interface SmokeCheck {
  readonly name: string;
  readonly path: string;
  readonly verify: (response: Response) => Promise<void> | void;
}

export interface ProductionSmokeResult {
  readonly passedChecks: readonly string[];
}

export class ProductionSmokeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionSmokeConfigurationError";
  }
}

export class ProductionSmokeCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionSmokeCheckError";
  }
}

function expectStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new ProductionSmokeCheckError(
      `expected HTTP ${expectedStatus}, received HTTP ${response.status}`,
    );
  }
}

async function expectJson(
  response: Response,
  expectedBody: unknown,
): Promise<void> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ProductionSmokeCheckError("response was not valid JSON");
  }

  if (JSON.stringify(body) !== JSON.stringify(expectedBody)) {
    throw new ProductionSmokeCheckError(
      "response did not match the public JSON contract",
    );
  }
}

function expectHeader(
  response: Response,
  name: string,
  expectedValue: string,
): void {
  const actualValue = response.headers.get(name);

  if (actualValue !== expectedValue) {
    throw new ProductionSmokeCheckError(
      `${name} did not match the production contract`,
    );
  }
}

function expectHeaderContaining(
  response: Response,
  name: string,
  expectedFragment: string,
): void {
  const actualValue = response.headers.get(name);

  if (!actualValue?.includes(expectedFragment)) {
    throw new ProductionSmokeCheckError(
      `${name} did not match the production contract`,
    );
  }
}

function createChecks(shareToken: string): readonly SmokeCheck[] {
  return [
    {
      name: "application liveness",
      path: "/api/health",
      async verify(response) {
        expectStatus(response, 200);
        expectHeader(response, "cache-control", "no-store");
        await expectJson(response, { service: "filedrop", status: "ok" });
      },
    },
    {
      name: "homepage security policy",
      path: "/",
      verify(response) {
        expectStatus(response, 200);

        for (const [name, expectedFragment] of REQUIRED_SECURITY_HEADERS) {
          expectHeaderContaining(response, name, expectedFragment);
        }
      },
    },
    {
      name: "anonymous session boundary",
      path: "/api/auth/session",
      async verify(response) {
        expectStatus(response, 200);
        expectHeader(response, "cache-control", "no-store");
        await expectJson(response, { authenticated: false });
      },
    },
    {
      name: "owner catalog boundary",
      path: "/api/files",
      verify(response) {
        expectStatus(response, 401);
        expectHeader(response, "cache-control", "no-store");
      },
    },
    {
      name: "cleanup authorization boundary",
      path: "/api/cron/cleanup",
      verify(response) {
        expectStatus(response, 401);
        expectHeader(response, "cache-control", "no-store");
        expectHeader(response, "www-authenticate", "Bearer");
      },
    },
    {
      name: "unknown download boundary",
      path: `/d/${shareToken}`,
      verify(response) {
        expectStatus(response, 404);
        expectHeader(response, "cache-control", "no-store");

        if (response.headers.has("location")) {
          throw new ProductionSmokeCheckError(
            "unknown download disclosed a redirect location",
          );
        }
      },
    },
  ];
}

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "[::1]"
  );
}

export function parseProductionSmokeBaseUrl(value: string | undefined): URL {
  if (!value) {
    throw new ProductionSmokeConfigurationError(
      "FILEDROP_SMOKE_BASE_URL is required",
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ProductionSmokeConfigurationError(
      "FILEDROP_SMOKE_BASE_URL must be a valid URL",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    isLoopbackHostname(url.hostname)
  ) {
    throw new ProductionSmokeConfigurationError(
      "FILEDROP_SMOKE_BASE_URL must be a public HTTPS origin without credentials, a port, path, query, or fragment",
    );
  }

  return url;
}

export async function runProductionSmoke({
  baseUrl,
  fetchImplementation = fetch,
  shareToken = randomBytes(32).toString("base64url"),
}: ProductionSmokeDependencies): Promise<ProductionSmokeResult> {
  const passedChecks: string[] = [];

  for (const check of createChecks(shareToken)) {
    let response: Response;

    try {
      response = await fetchImplementation(new URL(check.path, baseUrl), {
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json, text/html;q=0.9",
          "User-Agent": "FileDrop-production-smoke/1.0",
        },
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(SMOKE_TIMEOUT_MILLISECONDS),
      });
    } catch {
      throw new ProductionSmokeCheckError(
        `${check.name}: request failed or exceeded 10 seconds`,
      );
    }

    try {
      await check.verify(response);
      passedChecks.push(check.name);
    } catch (error) {
      if (error instanceof ProductionSmokeCheckError) {
        throw new ProductionSmokeCheckError(`${check.name}: ${error.message}`);
      }

      throw new ProductionSmokeCheckError(
        `${check.name}: response verification failed`,
      );
    } finally {
      if (!response.bodyUsed) {
        await response.body?.cancel();
      }
    }
  }

  return { passedChecks };
}
