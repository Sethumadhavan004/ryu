import assert from "node:assert/strict";
import { test } from "node:test";
import { allowOrigin } from "./app";

test("CORS admits this machine and the LAN, never an arbitrary website", () => {
  for (const o of ["http://localhost:8081", "http://127.0.0.1:8081", "http://192.168.1.20:8081", "http://10.0.0.5:8081", "http://172.20.1.1:8081"])
    assert.equal(allowOrigin(o), o, o);
  for (const o of ["https://evil.example", "http://172.32.0.1", "http://localhost.evil.com", "null"])
    assert.equal(allowOrigin(o), null, o);
});
