function shellSingleQuote(value: string): string {
  return `'${value.split("'").join("'\\''")}'`;
}

function normalizeJsonBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return body;
  }
}

export function buildCurlCommand(url: string, body: string): string {
  return [
    "curl",
    "--insecure",
    "-X",
    "POST",
    shellSingleQuote(url),
    "-H",
    shellSingleQuote("Content-Type: application/json"),
    "--data-raw",
    shellSingleQuote(normalizeJsonBody(body)),
  ].join(" ");
}
