export function isTrustedMutationOrigin(
  request: Request,
  expectedOrigin: string,
): boolean {
  const originHeader = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!originHeader || (fetchSite && fetchSite !== "same-origin")) {
    return false;
  }

  try {
    return new URL(originHeader).origin === expectedOrigin;
  } catch {
    return false;
  }
}
