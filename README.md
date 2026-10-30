# Flash Validate

An API that checks JSON data against explicit rules and returns readable errors. It never modifies the input or converts strings into numbers.

Default address: **http://127.0.0.1:4313**.

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

## Run locally

Requires Node.js 22 or later. There are no third-party dependencies or install steps.

```sh
npm start
```

In another terminal, run `npm run demo` for an actual HTTP example or `npm test` for the automated checks. Each project runs on its own port. Stop the server with Ctrl+C.

## Access and request format

By default, the server listens on `127.0.0.1`. Set `PORT` and `HOST` to change the listener. Setting `API_TOKEN` enables Bearer authentication for all API routes; `GET /health` stays public. A token must be 32–256 characters. Non-loopback binding requires a token. For example, in PowerShell:

```powershell
$env:API_TOKEN = 'replace-with-a-random-secret-at-least-32-characters'
npm start
```

Send `Authorization: Bearer <your-token>` when authentication is enabled. The demo reads the same `API_TOKEN` environment variable; its optional `API_URL` changes the target server. The server does not read a .env file automatically. For access beyond your own computer, use a trusted HTTPS reverse proxy and restrict access. There is no built-in TLS, per-user authorization, CORS support, or managed hosting in this repository.

Requests with bodies must use `Content-Type: application/json`. Keys/IDs are 1–64 ASCII letters, numbers, underscores or hyphens and must start with a letter or number. No query parameters are supported. Responses are JSON except successful deletion (204). Error responses use `{"error":{"code":"...","message":"..."}}`.

Bodies are limited to 64 KiB, 32 nesting levels and 10,000 values. Numbers must be finite. Unsupported methods return 405, bad JSON 400, unsupported content types 415, oversized bodies 413, and missing/incorrect credentials 401. Responses use `Cache-Control: no-store`. Health reports process availability, not downstream readiness. No endpoint executes submitted code or fetches URLs from submitted data.

## Development notes

Tests make real requests to local HTTP servers on temporary ports. GitHub Actions runs them on Node 22 and 24. This is a single-process reference service, not a hosted production offering. Tests cover known cases; they are not a promise that no bugs remain. MIT licensed.
