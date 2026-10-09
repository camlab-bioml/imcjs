import type { ByteSource } from "./data";


/** HTTP range-backed source. Reads only requested byte ranges from a URL. */
export class URLByteSource implements ByteSource {
  readonly size: number;

  private constructor(
    private readonly url: string,
    size: number
  ) {
    this.size = size;
  }
  
  static async open(url: string): Promise<URLByteSource> {
    // Fetch first byte to obtain total size from Content-Range
    const response = await fetch(url, {
      headers: {
        Range: "bytes=0-0",
      },
    });

    if (response.status !== 206) {
      throw new Error(
        `Server does not support range requests (status ${response.status})`
      );
    }

    const contentRange = response.headers.get("Content-Range");

    if (!contentRange) {
      throw new Error("Missing Content-Range header");
    }

    // "bytes 0-0/625001376"
    const size = Number(contentRange.split("/")[1]);

    return new URLByteSource(url, size);
  }

  async read(start: number, end: number): Promise<Uint8Array> {
    const response = await fetch(this.url, {
      headers: {
        Range: `bytes=${start}-${end - 1}`,
      },
    });

    if (response.status !== 206) {
      throw new Error(
        `Range request failed (status ${response.status})`
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}