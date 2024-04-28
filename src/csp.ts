// https://github.com/helmetjs/content-security-policy-parser
type ParsedContentSecurityPolicy = Map<string, string[]>;

const ASCII_WHITESPACE_CHARS = "\t\n\f\r ";
const ASCII_WHITESPACE = RegExp(`[${ASCII_WHITESPACE_CHARS}]+`);
const ASCII_WHITESPACE_AT_START = RegExp(`^[${ASCII_WHITESPACE_CHARS}]+`);
const ASCII_WHITESPACE_AT_END = RegExp(`[${ASCII_WHITESPACE_CHARS}]+$`);

const ASCII = /^[\x00-\x7f]*$/;

/**
 * Parse a serialized Content Security Policy via [the spec][0].
 *
 * [0]: https://w3c.github.io/webappsec-csp/#parse-serialized-policy
 *
 * @param policy The serialized Content Security Policy to parse.
 * @returns A Map of Content Security Policy directives.
 * @example
 * parseContentSecurityPolicy(
 *   "default-src 'self'; script-src 'unsafe-eval' scripts.example; object-src; style-src styles.example",
 * );
 * // => Map(4) {
 * //      "default-src" => ["'self'"],
 * //      "script-src" => ["'unsafe-eval'", "scripts.example"],
 * //      "object-src" => [],
 * //      "style-src" => ["styles.example"],
 * //    }
 */
export function parseContentSecurityPolicy(policy: string): ParsedContentSecurityPolicy {
  const result: ParsedContentSecurityPolicy = new Map();

  for (let token of policy.split(";")) {
    token = token.replace(ASCII_WHITESPACE_AT_START, "").replace(ASCII_WHITESPACE_AT_END, "");

    if (!token || !ASCII.test(token)) {
      continue;
    }

    const [rawDirectiveName, ...directiveValue] = token.split(ASCII_WHITESPACE);
    const directiveName = rawDirectiveName!.toLowerCase();
    if (result.has(directiveName)) {
      continue;
    }
    result.set(directiveName, directiveValue);
  }

  return result;
}

export function serializeContentSecurityPolicy(policy: Map<string, string[]>) {
  const result: string[] = [];

  for (const [key, value] of policy.entries()) {
    if (value.length > 0) {
      result.push(`${key} ${value.join(" ")}`);
    } else {
      result.push(key);
    }
  }

  return result.length >= 1 ? result.join("; ") + ";" : "";
}
