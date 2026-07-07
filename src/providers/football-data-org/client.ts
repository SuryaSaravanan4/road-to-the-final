const BASE_URL = "https://api.football-data.org/v4";

export async function fdRequest<T>(path: string): Promise<T> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set. Get a free key at https://www.football-data.org/client/register and add it to .env.local"
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("football-data.org rate limit exceeded — try again shortly.");
    }
    throw new Error(`football-data.org request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}
