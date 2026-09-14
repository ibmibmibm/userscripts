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

/** GET a page through the userscript manager (cross-origin, with the site's cookies). */
export function gmFetchText(url: string, charset: string | undefined, request: GmRequest): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const details: GmDetails = {
      method: "GET",
      url,
      timeout: 15000,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error("Request failed")),
      ontimeout: () => reject(new Error("Timed out")),
    };
    if (charset) details.overrideMimeType = `text/html; charset=${charset}`;
    request(details);
  });
}
