import { CCError } from "../utils.js";
import { warnIfPartsIgnored } from "../Warnings.js";
import { Word, eq, mergeWords } from "../shell/Word.js";
import { parse, COMMON_SUPPORTED_ARGS } from "../parse.js";
import type { Request, RequestUrl, Warnings } from "../parse.js";
import { Headers } from "../Headers.js";
import { parseQueryString } from "../Query.js";

import { repr, reprStr } from "./wget.js";

export const supportedArgs = new Set([
  ...COMMON_SUPPORTED_ARGS,
  "form",
  "form-string",

  "location",
  "no-location",
  "location-trusted",
  "no-location-trusted",
  "max-redirs",

  "ciphers",
  "insecure",
  "cert",
  "key",
  "cacert",
  "capath",

  "proxy",
  "noproxy", // not supported, just better error

  "timeout",
  "connect-timeout",

  // xh supports these auth methods like HTTPie
  "anyauth",
  "no-anyauth",
  "digest",
  "no-digest",
  "negotiate",
  "no-negotiate",
  "delegation", // GSS/kerberos
  "ntlm",
  "no-ntlm",
  "ntlm-wb",
  "no-ntlm-wb",

  // xh looks for a netrc file by default like HTTPie
  "no-netrc",

  "verbose",
  "silent",

  "upload-file",
  "next",
]);

function escapeHeader(name: Word): Word {
  // TODO: more complicated, have to check that it's not already backslashed
  // and not all values might be representable
  return name.replace("=", "\\=");
}

function escapeHeaderValue(value: Word): Word {
  if ((value.startsWith("="), value.startsWith("@"))) {
    value = value.prepend("\\");
  }
  return value;
}

function escapeJsonName(name: string, isFirstKey = false): string {
  name = name
    .replace("\\", "\\\\")
    .replace("[", "\\[")
    .replace("]", "\\]")
    .replace(":", "\\:") // both := need to be escaped individually or you get weird results
    .replace("=", "\\=");

  // "A regular integer in a path (e.g [10]) means an array index;
  // but if you want it to be treated as a string, you can escape
  // the whole number by using a backslash (\) prefix."
  // TODO: check this regex
  if (!isFirstKey && /^\d+$/.test(name)) {
    name = "\\" + name;
  }
  return name;
}

function escapeJsonStr(value: string): string {
  // The backslash only has an effect on some characters and not
  // the backslash itself, so it seems like there's no way to send a literal '\='
  // value = value.replace("\\=", "\\\\=");
  if (value.startsWith("\\=")) {
    throw new CCError(
      "Unrepresentable JSON string: " +
        JSON.stringify(value) +
        ". xh cannot send a string that starts with \\=",
    );
  }
  return value.replace("=", "\\=");
}

function urlencodedAsXh(flags: string[], items: string[], data: Word) {
  let queryList;
  try {
    [queryList] = parseQueryString(data);
  } catch {}
  if (!queryList) {
    flags.push("--raw " + (repr(data) || "''"));
    return;
  }

  flags.push("--form");
  for (const [name, value] of queryList) {
    items.push(
      repr(mergeWords(escapeQueryName(name), "=", escapeQueryValue(value))),
    );
  }
}

function toJsonXh(obj: any, key = ""): string[] {
  if (obj === null) {
    return [reprStr(key) + ":=null"];
  } else if (typeof obj === "boolean") {
    return [reprStr(key) + ":=" + obj.toString()];
  } else if (typeof obj === "number") {
    return [reprStr(key) + ":=" + reprStr(obj.toString())];
  } else if (typeof obj === "string") {
    return [reprStr(key) + "=" + reprStr(escapeJsonStr(obj))];
  } else if (Array.isArray(obj)) {
    if (!obj.length) {
      return [reprStr(key) + ":=" + "[]"];
    }
    return obj.map((item) => toJsonXh(item, key + "[]")).flat();
  } else {
    if (!Object.keys(obj).length) {
      return [reprStr(key) + ":=" + "{}"];
    }
    return Object.entries(obj)
      .map(([name, value]) =>
        toJsonXh(
          value,
          key
            ? key + "[" + escapeJsonName(name) + "]"
            : escapeJsonName(name, true),
        ),
      )
      .flat();
  }
}

function jsonAsXh(flags: string[], items: string[], data: string) {
  let json;
  try {
    json = JSON.parse(data);
  } catch {}
  // Only non-empty, top-level objects and arrays can be serialized as command line arguments
  if (
    (typeof json === "object" && json !== null && Object.keys(json).length) ||
    (Array.isArray(json) && json.length)
  ) {
    let jsonItems;
    try {
      jsonItems = toJsonXh(json);
    } catch {}
    if (jsonItems) {
      for (const jsonItem of jsonItems) {
        items.push(jsonItem);
      }
      return;
    }
  }
  flags.push("--raw " + (reprStr(data) || "''"));
}

function formatDataXh(
  flags: string[],
  items: string[],
  data: Word,
  headers: Headers,
) {
  const contentType = headers.getContentType();
  if (contentType === "application/json" && data.isString()) {
    jsonAsXh(flags, items, data.toString());
  } else if (contentType === "application/x-www-form-urlencoded") {
    urlencodedAsXh(flags, items, data);
  } else {
    flags.push("--raw " + (repr(data) || "''"));
  }
}

function escapeFormName(name: Word): Word {
  return name.replace("\\", "\\\\").replace("=", "\\=");
}

function escapeQueryName(name: Word): Word {
  // an unquoted ":" turns into ": "
  return name.replace("\\", "\\\\").replace(":", "\\:").replace("=", "\\=");
}

function escapeQueryValue(value: Word): Word {
  // TODO: the backslash only has an effect on some characters and not
  // the backslash itself, so it seems like there's no way to send a literal '\='
  // value = value.replace("\\=", "\\\\=");
  if ((value.startsWith("="), value.startsWith("@"))) {
    value = value.prepend("\\");
  }
  return value;
}

function requestToXh(
  request: Request,
  url: RequestUrl,
  warnings: Warnings,
): string {
  const flags: string[] = [];
  let method: string | null = null;
  let urlArg = url.url;
  const items: string[] = [];

  if (url.uploadFile || request.data || request.multipartUploads) {
    if (!eq(url.method, "POST")) {
      method = repr(url.method);
    }
  } else if (!eq(url.method, "GET")) {
    method = repr(url.method);
  }

  // Headers
  if (request.headers.length) {
    for (const [headerName, headerValue] of request.headers) {
      if (headerValue === null) {
        items.push(repr(mergeWords(escapeHeader(headerName), ":")));
      } else if (!headerValue.toBool()) {
        items.push(repr(mergeWords(escapeHeader(headerName), ";")));
      } else {
        items.push(
          repr(
            mergeWords(
              escapeHeader(headerName),
              ":",
              escapeHeaderValue(headerValue),
            ),
          ),
        );
      }
    }
  }

  // Authentication
  if (url.auth) {
    const [user, password] = url.auth;

    if (request.authType === "digest") {
      flags.push("--auth-type digest");
    } else if (request.authType === "ntlm" || request.authType === "ntlm-wb") {
      flags.push("--auth-type=ntlm");
      warnings.push([
        "xh-ntlm",
        "NTLM auth requires authentication plugin for xh",
      ]);
    } else if (request.authType === "negotiate") {
      flags.push("--auth-type=negotiate");
      warnings.push([
        "xh-negotiate",
        "SPNEGO (GSS Negotiate) auth requires authentication plugin for xh",
      ]);
    }

    if (password) {
      flags.push("--auth " + repr(mergeWords(user, ":", password)));
    } else {
      flags.push("--auth " + repr(user));
    }
  }

  // SSL/TLS options
  if (request.insecure) {
    flags.push("--verify=no");
  }

  if (request.cacert) {
    flags.push("--verify=" + repr(request.cacert));
  }

  if (request.cert) {
    flags.push("--cert=" + repr(request.cert[0]));
  }

  if (request.key) {
    flags.push("--cert-key=" + repr(request.key));
  }

  if (request.cert && request.cert[1]) {
    flags.push("--cert-key-pass=" + repr(request.cert[1]));
  }

  // Proxy
  if (request.proxy) {
    flags.push("--proxy " + repr(request.proxy));
  }

  // Timeout
  if (request.timeout) {
    flags.push("--timeout=" + repr(request.timeout));
  }

  // Data handling
  if (url.uploadFile) {
    if (eq(url.uploadFile, "-") || eq(url.uploadFile, ".")) {
      warnings.push([
        "xh-stdin",
        "pass in the file contents to xh through stdin",
      ]);
    } else {
      items.push("@" + repr(url.uploadFile));
    }
  } else if (request.multipartUploads) {
    flags.push("--multipart");
    for (const m of request.multipartUploads) {
      if ("content" in m) {
        items.push(repr(escapeFormName(m.name)) + "=" + repr(m.content));
      } else {
        if ("filename" in m && m.filename) {
          items.push(repr(escapeFormName(m.name)) + "@" + repr(m.filename));
          if (!eq(m.filename, m.contentFile)) {
            warnings.push([
              "xh-multipart-fake-filename",
              "xh doesn't support multipart uploads that read a certain filename but send a different filename",
            ]);
          }
        } else {
          items.push(repr(escapeFormName(m.name)) + "=@" + repr(m.contentFile));
        }
      }
    }
  } else if (
    request.dataArray &&
    request.dataArray.length === 1 &&
    !(request.dataArray[0] instanceof Word) &&
    !request.dataArray[0].name
  ) {
    items.push("@" + repr(request.dataArray[0].filename));
  } else if (request.data) {
    formatDataXh(flags, items, request.data, request.headers);
  }

  // Query parameters
  if (url.queryList) {
    urlArg = url.urlWithoutQueryList;
    for (const [name, value] of url.queryList) {
      items.push(
        repr(mergeWords(escapeQueryName(name), "==", escapeQueryValue(value))),
      );
    }
  }

  // Redirects
  if (request.followRedirects || request.followRedirectsTrusted) {
    flags.push("--follow");
  }

  if (request.maxRedirects && request.maxRedirects.toString() !== "30") {
    flags.push("--max-redirects " + repr(request.maxRedirects));
  }

  // Verbose output
  if (request.verbose) {
    flags.push("--verbose");
  }

  // Build command
  function localhostShorthand(u: Word): Word {
    if (u.startsWith("localhost:")) {
      return u.slice("localhost".length);
    } else if (u.startsWith("localhost/") || eq(u, "localhost")) {
      return u.slice("localhost".length).prepend(":");
    }
    return u;
  }

  if (urlArg.startsWith("https://")) {
    urlArg = localhostShorthand(urlArg.slice("https://".length));
  } else if (urlArg.startsWith("http://")) {
    urlArg = localhostShorthand(urlArg.slice("http://".length));
  }

  const command = "xh";
  const args = [...flags];
  if (method) {
    args.push(method);
  }
  args.push(repr(urlArg));
  args.push(...items);

  const multiline =
    args.length > 3 || args.reduce((a, b) => a + b.length, 0) > 80 - 5;
  const joiner = multiline ? " \\\n  " : " ";
  return command + " " + args.join(joiner) + "\n";
}

export function _toXh(requests: Request[], warnings: Warnings = []): string {
  const commands = [];

  for (const request of requests) {
    warnIfPartsIgnored(request, warnings, {
      dataReadsFile: true,
      // xh has its own session handling
      multipleUrls: true,
    });

    if (
      request.dataReadsFile &&
      request.dataArray &&
      request.dataArray.length &&
      (request.dataArray.length > 1 ||
        (!(request.dataArray[0] instanceof Word) && request.dataArray[0].name))
    ) {
      warnings.push([
        "unsafe-data",
        "the generated data content is wrong, " +
          JSON.stringify("@" + request.dataReadsFile) +
          " means read the file " +
          JSON.stringify(request.dataReadsFile),
      ]);
    }

    for (const url of request.urls) {
      commands.push(requestToXh(request, url, warnings));
    }
  }
  return commands.join("\n\n");
}

export function toXhWarn(
  curlCommand: string | string[],
  warnings: Warnings = [],
): [string, Warnings] {
  const requests = parse(curlCommand, supportedArgs, warnings);
  const xh = _toXh(requests, warnings);
  return [xh, warnings];
}

export function toXh(curlCommand: string | string[]): string {
  return toXhWarn(curlCommand)[0];
}
