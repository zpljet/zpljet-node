/**
 * End-to-end tests against a real ZPLJet API.
 *
 * Skipped unless ZPLJET_API_KEY is set — they consume real quota:
 *
 *   ZPLJET_API_KEY=zpl_… npm run test:e2e
 *
 * Point them at a local/staging stack with ZPLJET_BASE_URL (e.g.
 * http://localhost:3000).
 */
import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  ZplJet,
} from "../src/index";

const apiKey = process.env.ZPLJET_API_KEY;
const baseUrl = process.env.ZPLJET_BASE_URL; // optional — defaults to production

const ZPL = "^XA^FO50,50^A0N,50,50^FDZPLJet e2e^FS^XZ";

describe.skipIf(!apiKey)("e2e: /v1/convert", () => {
  const zpljet = new ZplJet({
    apiKey: apiKey ?? "zpl_e2e_not_configured",
    ...(baseUrl ? { baseUrl } : {}),
  });

  it("converts ZPL to a PDF (data mode)", async () => {
    const label = await zpljet.convert({ zpl: ZPL });

    expect(label.contentType).toBe("application/pdf");
    expect(label.id).toBeTruthy();
    // %PDF magic bytes
    expect([...label.data.slice(0, 4)]).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it("converts ZPL to a PNG", async () => {
    const label = await zpljet.convert({ zpl: ZPL, format: "png", dpmm: 12 });

    expect(label.contentType).toBe("image/png");
    // \x89PNG magic bytes
    expect([...label.data.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rejects invalid ZPL with BadRequestError", async () => {
    const err = await zpljet.convert({ zpl: "not zpl at all" }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.param).toBe("zpl");
  });

  it("rejects a bad API key with AuthenticationError", async () => {
    const impostor = new ZplJet({
      apiKey: "zpl_definitely_not_a_real_key",
      ...(baseUrl ? { baseUrl } : {}),
    });
    await expect(impostor.convert({ zpl: ZPL })).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("hosts the file with output:url (or cleanly refuses on the free plan)", async () => {
    try {
      const hosted = await zpljet.convert({ zpl: ZPL, output: "url" });
      expect(hosted.url).toMatch(/^https?:\/\//);
      expect(hosted.pages).toBeGreaterThanOrEqual(1);
      expect(Date.parse(hosted.expiresAt)).toBeGreaterThan(Date.now());
    } catch (err) {
      // Free-plan keys can't host — the typed refusal is the correct behavior.
      expect(err).toBeInstanceOf(PermissionDeniedError);
    }
  });
});
