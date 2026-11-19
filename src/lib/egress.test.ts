import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, EgressError } from "./egress.ts";

const blocked = (url: string) =>
  assert.throws(() => assertPublicHttpUrl(url), EgressError, url);
const allowed = (url: string, opts?: { allowHttp?: boolean }) =>
  assert.equal(assertPublicHttpUrl(url, opts).toString(), new URL(url).toString());

describe("assertPublicHttpUrl", () => {
  it("allows ordinary public https URLs", () => {
    allowed("https://example.com/page?q=1");
    allowed("https://sub.domain.co.uk:8443/x");
    allowed("https://8.8.8.8/dns");
  });

  it("rejects http unless the flag allows it", () => {
    blocked("http://example.com/");
    allowed("http://example.com/", { allowHttp: true });
  });

  it("rejects non-http schemes and credentials in URL", () => {
    blocked("ftp://example.com/file");
    blocked("file:///etc/passwd");
    blocked("https://user:pass@example.com/");
    blocked("https://user@example.com/");
  });

  it("rejects private, loopback and link-local IPv4 literals", () => {
    blocked("https://10.0.0.5/admin");
    blocked("https://172.16.0.1/");
    blocked("https://172.31.255.255/");
    blocked("https://192.168.1.1/");
    blocked("https://127.0.0.1:8080/");
    blocked("https://169.254.169.254/latest/meta-data/");
    blocked("https://0.0.0.0/");
  });

  it("allows public IPv4 at range edges", () => {
    allowed("https://172.15.0.1/");
    allowed("https://172.32.0.1/");
    allowed("https://11.0.0.1/");
  });

  it("rejects local hostnames and IPv6 locals", () => {
    blocked("https://localhost:3000/");
    blocked("https://printer.local/");
    blocked("https://metadata.google.internal/");
    blocked("https://[::1]/");
    blocked("https://[fe80::1]/");
    blocked("https://[fd00::1]/");
    blocked("https://[::ffff:10.0.0.1]/");
  });

  it("rejects garbage", () => {
    blocked("not a url");
    blocked("");
  });
});
