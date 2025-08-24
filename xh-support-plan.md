# Step-by-Step Implementation Plan for xh Generator

Based on my analysis of the existing HTTPie generator and xh documentation, here's your complete implementation plan:

## 1. **Add xh to project configuration files**

**a) Update README.md:**

- Add xh to the list of supported languages/tools
- Add an example showing curl to xh conversion

**b) Update index.ts:**

```typescript
export { toXh } from "./generators/xh.js";
```

**c) Update cli.ts:**

- Add xh as a supported language option in the CLI

**d) Update test-utils.ts:**

- Add xh to the `generators` object for testing

## 2. **Create the xh generator: `src/generators/xh.ts`**

Since xh is HTTPie-compatible, you can largely base it on the existing HTTPie generator with these key considerations:

**Structure:**

```typescript
import { Word, eq } from "../shell/Word.js";
import { Request, Headers } from "../Request.js";
import { reprStr } from "./php/php.js"; // or appropriate repr function
import { warnf } from "../Warnings.js";

// xh-specific supported arguments
const supportedArgs = new Set([
  // Basic HTTP
  "url",
  "request",
  "method",
  "user-agent",

  // Request items (HTTPie compatible)
  "header",
  "data",
  "form",
  "json",
  "raw",

  // Authentication
  "auth",
  "auth-type",

  // SSL/TLS
  "verify",
  "cert",
  "cert-key",
  "cert-key-pass",

  // Output options
  "print",
  "headers",
  "body",
  "verbose",
  "quiet",
  "pretty",
  "style",
  "format-options",

  // xh-specific features
  "follow",
  "max-redirects",
  "timeout",
  "proxy",
  "resolve",
  "interface",

  // HTTP/2 specific (xh advantage)
  "http2",
  "http2-prior-knowledge",
]);

export function toXh(request: Request): string {
  // Implementation similar to HTTPie but with xh syntax
}
```

**Key differences from HTTPie:**

- xh uses different default behaviors (HTTP/2 by default when available)
- xh has some additional HTTP/2 specific options
- xh might have slightly different SSL/proxy handling
- Same request items syntax as HTTPie (`:`, `=`, `:=`, `==`, `@`, `;`)

## 3. **Request Items Implementation (HTTPie Compatible)**

xh uses the same request items syntax as HTTPie:

```typescript
// Headers: Key:Value
"X-API-Key:abc123";

// JSON data: key=value or key:=raw_json
"name=John"; // string
"age:=25"; // number
"active:=true"; // boolean

// Query parameters: key==value
"q==search term";

// Form data: key=value (with --form flag)
"username=john";

// File uploads: key@filename
"file@path/to/file.txt";

// File content as value: key=@filename
"data=@data.json";

// Raw JSON as value: key:=@filename
"config:=@config.json";

// Empty header removal: Key:
"Accept:";

// Header with empty value: Key;
"X-Custom;";
```

## 4. **Authentication Support**

```typescript
// Basic auth
"--auth username:password";

// Bearer token
"--auth-type bearer --auth token123";

// Different auth plugins (same as HTTPie)
```

## 5. **xh-Specific Features to Highlight**

```typescript
// HTTP/2 support (default in xh)
"--http2"; // explicit HTTP/2
"--http2-prior-knowledge"; // HTTP/2 without upgrade

// Better performance flags
"--timeout 30";
"--max-redirects 5";

// Curl translation mode (xh can show equivalent curl)
"--curl"; // shows curl equivalent
```

## 6. **Testing Strategy**

**a) Create test fixtures directory: `test/fixtures/xh/`**

**b) Port HTTPie tests to xh format:**

- Copy relevant tests from httpie
- Modify syntax where xh differs from HTTPie
- Add xh-specific feature tests (HTTP/2, etc.)

**c) Key test categories:**

- Basic GET/POST requests
- Request items (headers, data, params)
- Authentication methods
- File uploads
- SSL/proxy configurations
- xh-specific features (HTTP/2, curl output)

## 7. **Implementation Priority**

**Phase 1 (Core HTTPie compatibility):**

1. Basic HTTP methods (GET, POST, PUT, DELETE, etc.)
2. Request items (headers, JSON data, query params)
3. Basic authentication
4. Output options (headers, body, verbose)

**Phase 2 (xh-specific features):**

1. HTTP/2 support flags
2. Performance optimizations
3. xh-specific SSL/proxy options
4. Curl translation output

**Phase 3 (Advanced features):**

1. File uploads and multipart forms
2. Advanced authentication plugins
3. Session management (if xh supports it)
4. Streaming and download modes

## 8. **Key Implementation Notes**

- **HTTPie Compatibility**: Since xh is explicitly HTTPie-compatible, start by copying the HTTPie generator and modifying incrementally
- **Request Items**: Use identical parsing logic for `:`, `=`, `:=`, `==`, `@` operators
- **HTTP/2**: Add xh-specific HTTP/2 flags that HTTPie doesn't have
- **Performance**: xh is Rust-based and faster, but command syntax should be nearly identical
- **Error Handling**: Follow same patterns as HTTPie generator for unsupported features

## 9. **Testing Commands to Verify**

```bash
# Basic functionality
curl -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"name":"test"}'
# Should convert to:
xh POST https://httpbin.org/post Content-Type:application/json name=test

# File upload
curl -X POST https://httpbin.org/post -F "file=@test.txt"
# Should convert to:
xh --form POST https://httpbin.org/post file@test.txt

# Authentication
curl -X GET https://httpbin.org/basic-auth/user/pass -u user:pass
# Should convert to:
xh --auth user:pass GET https://httpbin.org/basic-auth/user/pass
```

This implementation plan leverages the existing HTTPie infrastructure while adding xh-specific enhancements. The HTTPie compatibility means you can reuse most of the request parsing logic, focusing on xh's unique features and performance optimizations.
