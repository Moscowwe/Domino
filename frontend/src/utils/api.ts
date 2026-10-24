/**
 * Safely parses response body as JSON with full instrumentation logs.
 */
export async function safeParseJson<T = any>(response: Response): Promise<T> {
    const raw = await response.text();

    console.group("API DEBUG");
    console.log("URL:", response.url);
    console.log("Status:", response.status);
    console.log("Headers:", [...response.headers.entries()]);
    console.log("Raw Response:", raw);
    console.groupEnd();

    if (!raw.trim()) {
        throw new Error(`Server returned an empty response (Status: ${response.status}).`);
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<div")) {
        const titleMatch = trimmed.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : "HTML Error Page";
        throw new Error(`Server returned HTML instead of JSON: "${title}" (Status: ${response.status}).`);
    }

    try {
        return JSON.parse(raw) as T;
    } catch (e: any) {
        throw new Error(`Failed to parse response as JSON (Status: ${response.status}): ${e.message}`);
    }
}
