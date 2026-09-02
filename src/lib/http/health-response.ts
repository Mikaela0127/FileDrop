const HEALTH_RESPONSE_BODY = {
  service: "filedrop",
  status: "ok",
} as const;

export function createHealthResponse(): Response {
  return Response.json(HEALTH_RESPONSE_BODY, {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
