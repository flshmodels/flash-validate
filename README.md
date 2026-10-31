# Flash Validate

An HTTP API that checks JSON against rules for types, lengths and ranges. The response lists invalid fields. It uses its own rule format, not the full JSON Schema standard.

Default address: **http://127.0.0.1:4313**.

## Setup

Requires Node.js 22 or later. No packages need to be installed.

```sh
npm start
```

Leave the server running. Open another terminal in the same folder:

```sh
npm run demo
npm test
```

The demo sends sample requests to the local server. Stop the server with Ctrl+C.

## Endpoints

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| GET | /health | None | Service name, version, status |
| POST | /v1/validate | schema, data | valid flag and validation errors |

```json
{
  "schema": {
    "type": "object",
    "properties": { "level": { "type": "integer", "minimum": 1 } },
    "required": ["level"]
  },
  "data": { "level": 0 }
}
```

This returns HTTP 200 with `valid: false` and an error at `/level`. A valid validation request returns 200 whether the data passes or fails. Broken or unsupported schemas return 422; missing request fields return 400.

## Supported rules

| Type | Rules |
| --- | --- |
| object | properties, required, additionalProperties |
| array | items (required), minItems, maxItems |
| string | minLength, maxLength |
| number / integer | minimum, maximum |
| boolean / null | Type only |
| All types | Optional enum of 1–100 scalar choices |

Every schema needs a `type`. Additional object properties are rejected unless `additionalProperties: true` is specified. Required fields must be declared in properties. Integer means a JavaScript safe integer; larger numbers need a different representation. String length counts Unicode code points, not bytes or user-perceived grapheme clusters. Error paths use JSON Pointer escaping; the root path is an empty string.

Errors have `path`, `code` and `message`. At most 100 are returned. `errorLimitReached` means the limit was reached, so additional errors may exist. Schemas are capped at 200 nodes and 8 levels of nesting below the root. Unsupported keywords fail explicitly.

This is a **small custom schema format, not a full JSON Schema implementation**. There are no regex patterns, references, coercion, defaults, network lookups, stored schemas or database. Validation does not establish a user's permissions or sanitize strings for HTML/SQL.

Seven service tests cover types, ranges, arrays, Unicode, property names, schema errors and resource limits. Seven transport tests cover the HTTP boundary.

## Access and requests

By default, the server listens on `127.0.0.1`. Set `PORT` and `HOST` to change the listener. Setting `API_TOKEN` enables Bearer authentication for all API routes; `GET /health` stays public. A token must be 32–256 characters. Non-loopback binding requires a token. For example, in PowerShell:

```powershell
$env:API_TOKEN = 'replace-with-a-random-secret-at-least-32-characters'
npm start
```

Send `Authorization: Bearer <your-token>` when authentication is enabled. The demo reads the same `API_TOKEN` environment variable; its optional `API_URL` changes the target server. The server does not read a .env file automatically. For access beyond your own computer, use a trusted HTTPS reverse proxy and restrict access. There is no built-in TLS, per-user authorization, CORS support, or managed hosting in this repository.

Requests with bodies must use `Content-Type: application/json`. No query parameters are supported. Responses are JSON. Error responses use `{"error":{"code":"...","message":"..."}}`.

Bodies are limited to 64 KiB, 32 nesting levels and 10,000 values. Numbers must be finite. Unsupported methods return 405, bad JSON 400, unsupported content types 415, oversized bodies 413, and missing/incorrect credentials 401. Responses use `Cache-Control: no-store`. The health route only confirms that this process is running. Submitted data is not executed or used to fetch URLs.

## Tests

Tests send HTTP requests to local servers on temporary ports. GitHub Actions runs them on Node 22 and 24.

MIT licensed. See [LICENSE](LICENSE).
