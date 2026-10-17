export interface GmResponse {
  status: number;
  responseText: string;
}

export interface GmDetails {
  method: "POST";
  url: string;
  data: string;
  headers: Record<string, string>;
  timeout: number;
  onload: (r: GmResponse) => void;
  onerror: () => void;
  ontimeout: () => void;
}

export type GmRequest = (d: GmDetails) => void;

/** A request with no answer after this long fails. */
const TIMEOUT_MS = 15000;

/** POST a form through the userscript manager (cross-origin). A non-2xx status rejects. */
export function gmPostForm(url: string, form: Record<string, string>, request: GmRequest): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    request({
      method: "POST",
      url,
      data: new URLSearchParams(form).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      timeout: TIMEOUT_MS,
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) resolve(r.responseText);
        else reject(new Error(`HTTP ${r.status}`));
      },
      onerror: () => reject(new Error("Request failed")),
      ontimeout: () => reject(new Error("Timed out")),
    });
  });
}
