export type AddressSuggestion = { id: string; label: string };

type Fetcher = typeof fetch;
const endpoint = "https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses";

async function request(path: string, key: string, signal?: AbortSignal, fetcher: Fetcher = fetch) {
  if (!key.trim()) throw new Error("Address lookup is not configured");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 8000);
  try {
    const response = await fetcher(path, {
      headers: { Authorization: `api_key="${key}"` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Address lookup unavailable");
    const body = await response.json();
    if (body.code !== 2000 || !body.result) throw new Error("Address lookup unavailable");
    return body.result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export async function findAddresses(query: string, key: string, signal?: AbortSignal, fetcher?: Fetcher): Promise<AddressSuggestion[]> {
  const term = query.trim();
  if (term.length < 3) return [];
  const fullPostcode = /^(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i.test(term);
  const result = await request(`${endpoint}?query=${encodeURIComponent(term)}&context=GBR&limit=${fullPostcode ? 100 : 8}`, key, signal, fetcher);
  if (!Array.isArray(result.hits)) throw new Error("Invalid address results");
  return result.hits.filter((hit: { id?: unknown; suggestion?: unknown }) =>
    typeof hit.id === "string" && typeof hit.suggestion === "string" && hit.suggestion.trim(),
  ).map((hit: { id: string; suggestion: string }) => ({ id: hit.id, label: hit.suggestion }));
}

export async function resolveAddress(id: string, key: string, signal?: AbortSignal, fetcher?: Fetcher): Promise<string> {
  const result = await request(`${endpoint}/${encodeURIComponent(id)}/gbr`, key, signal, fetcher);
  // Keep every premise line: line_1 may be the flat and line_2 the building.
  if (typeof result.line_1 !== "string" || !result.line_1.trim() || typeof result.postcode !== "string" || !result.postcode.trim()) {
    throw new Error("Incomplete address");
  }
  return [result.line_1, result.line_2, result.line_3, result.post_town, result.postcode]
    .filter((part): part is string => typeof part === "string" && !!part.trim())
    .map((part) => part.trim()).join(", ");
}
