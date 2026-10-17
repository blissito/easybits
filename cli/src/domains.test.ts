import { test } from "node:test";
import assert from "node:assert/strict";
import { dnsLines, matchDomain } from "./commands/domains.ts";

const items = [
  { id: "aaaaaaaaaaaaaaaaaaaaaaaa", domain: "example.com" },
  { id: "bbbbbbbbbbbbbbbbbbbbbbbb", domain: "tienda.mx" },
];

test("un id de 24 hex pasa directo", () => {
  assert.equal(matchDomain("cccccccccccccccccccccccc", items), "cccccccccccccccccccccccc");
});

test("el dominio se resuelve a su id (mayúsculas, esquema y ruta no importan)", () => {
  assert.equal(matchDomain("Tienda.MX", items), "bbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(matchDomain("https://example.com/", items), "aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(matchDomain("otro.com", items), null);
});

test("los registros de la raíz se marcan como opcionales", () => {
  const lines = dnsLines(
    [
      { name: "_easybits-verify.example.com", type: "TXT", values: ['"tok"'] },
      { name: "example.com", type: "A", values: ["1.2.3.4"] },
    ],
    new Set(["example.com", "www.example.com"]),
  );
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /root|raíz/);
  assert.match(lines[1], /root|raíz/);
});
