/**
 * ZPLJet TypeScript/JavaScript SDK.
 * https://zpljet.com/docs
 *
 * @example
 * ```ts
 * import { writeFile } from "node:fs/promises";
 * import { ZplJet } from "@zpljet/node";
 *
 * const zpljet = new ZplJet({ apiKey: process.env.ZPLJET_API_KEY! });
 * const label = await zpljet.convert({ zpl: "^XA^FO50,50^A0N,50,50^FDHello^FS^XZ" });
 * await writeFile("label.pdf", label.data);
 * ```
 */

export { ZplJet } from "./client";
export {
  APIConnectionError,
  APIError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  ConversionFailedError,
  PayloadTooLargeError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServiceUnavailableError,
  ZplJetError,
} from "./errors";
export type { ApiErrorCode } from "./errors";
export type {
  ClientOptions,
  ConvertParams,
  Dpmm,
  HostedLabel,
  LabelData,
  LabelFormat,
  OutputMode,
  RequestOptions,
} from "./types";
export { VERSION } from "./version";
