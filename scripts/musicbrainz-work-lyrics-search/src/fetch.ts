export interface GmResponse {
  status: number;
  responseText: string;
}

export interface GmDetails {
  method: "GET";
  url: string;
  timeout: number;
  overrideMimeType?: string;
  onload: (r: GmResponse) => void;
  onerror: () => void;
  ontimeout: () => void;
}

export type GmRequest = (d: GmDetails) => void;

/**
 * GET a page through the userscript manager (cross-origin, with the site's cookies).
 * A response with the site's emptyStatus resolves to "" (no hits); other non-2xx statuses reject.
 */
export function gmFetchText(url: string, charset: string | undefined, request: GmRequest, emptyStatus?: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const details: GmDetails = {
      method: "GET",
      url,
      timeout: 15000,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) resolve(r.responseText);
        else if (r.status === emptyStatus) resolve("");
        else reject(new Error(`HTTP ${r.status}`));
      },
      onerror: () => reject(new Error("Request failed")),
      ontimeout: () => reject(new Error("Timed out")),
    };
    if (charset) details.overrideMimeType = `text/html; charset=${charset}`;
    request(details);
  });
}
