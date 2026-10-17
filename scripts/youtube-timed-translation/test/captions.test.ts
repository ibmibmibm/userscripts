import { originalTrackUrl, trackKey, videoIdFromUrl } from "../src/captions";

const REQUEST =
  "https://www.youtube.com/api/timedtext?v=omuJpoV-Ko4&ei=x&caps=asr&opi=1&xoaf=5&lang=en&kind=asr&variant=gemini&fmt=json3&xorb=2&xobt=3&xovt=3&cbr=Chrome&c=WEB&cver=2.20261015&pot=TOKEN&potc=1&tlang=zh-Hant";

describe("videoIdFromUrl", () => {
  it("reads the video ID of a watch page or a live page only", () => {
    expect(videoIdFromUrl("https://www.youtube.com/watch?v=omuJpoV-Ko4&t=30s")).toBe("omuJpoV-Ko4");
    expect(videoIdFromUrl("https://www.youtube.com/live/OQzlSWMbX8I?si=x")).toBe("OQzlSWMbX8I");
    expect(videoIdFromUrl("https://www.youtube.com/live/")).toBeNull();
    expect(videoIdFromUrl("https://www.youtube.com/")).toBeNull();
    expect(videoIdFromUrl("https://www.youtube.com/shorts/omuJpoV-Ko4")).toBeNull();
    expect(videoIdFromUrl("not a url")).toBeNull();
  });
});

describe("originalTrackUrl", () => {
  it("keeps the proof token and drops the YouTube translation", () => {
    const url = new URL(originalTrackUrl(REQUEST, "omuJpoV-Ko4")!);
    expect(url.searchParams.get("pot")).toBe("TOKEN");
    expect(url.searchParams.get("fmt")).toBe("json3");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.has("tlang")).toBe(false);
  });

  it("sets fmt=json3 when the player asked for another format", () => {
    const url = new URL(originalTrackUrl(REQUEST.replace("fmt=json3", "fmt=srv3"), "omuJpoV-Ko4")!);
    expect(url.searchParams.get("fmt")).toBe("json3");
  });

  it("rejects a request for another video, such as an ad", () => {
    expect(originalTrackUrl(REQUEST, "otherVideo1")).toBeNull();
    expect(originalTrackUrl("https://www.youtube.com/api/stats/watchtime?v=omuJpoV-Ko4", "omuJpoV-Ko4")).toBeNull();
    expect(originalTrackUrl("garbage", "omuJpoV-Ko4")).toBeNull();
  });
});

describe("trackKey", () => {
  it("is the same for a request with a new token and different for another language", () => {
    const a = originalTrackUrl(REQUEST, "omuJpoV-Ko4")!;
    const b = originalTrackUrl(REQUEST.replace("pot=TOKEN", "pot=OTHER"), "omuJpoV-Ko4")!;
    const c = originalTrackUrl(REQUEST.replace("lang=en", "lang=ja"), "omuJpoV-Ko4")!;
    expect(trackKey(a)).toBe(trackKey(b));
    expect(trackKey(a)).not.toBe(trackKey(c));
  });
});
