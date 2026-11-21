/**
 * Fail-closed validator for a built playable. Pure function: it takes the HTML
 * text and the byte size, and returns one verdict per rule. A rule that cannot be
 * evaluated counts as a failure, never as a pass.
 *
 * Limits come from the public network specs: AppLovin takes one HTML file under
 * 5 MB, Meta takes a single HTML file under 2 MB.
 */

export type Severity = "error" | "warning";

export interface RuleResult {
  id: string;
  description: string;
  severity: Severity;
  passed: boolean;
  detail: string;
}

export interface Verdict {
  /** True when no rule of severity "error" failed. */
  passed: boolean;
  bytes: number;
  rules: RuleResult[];
}

export const LIMITS = {
  /** AppLovin: single HTML file under 5 MB. */
  hardBytes: 5 * 1024 * 1024,
  /** Meta: single HTML file under 2 MB. */
  softBytes: 2 * 1024 * 1024,
} as const;

interface Rule {
  id: string;
  description: string;
  severity: Severity;
  check(html: string, bytes: number): { passed: boolean; detail: string };
}

const EXTERNAL_RESOURCE_PATTERNS: readonly [string, RegExp][] = [
  ["script with src", /<script\b[^>]*\bsrc\s*=/i],
  ["stylesheet link", /<link\b[^>]*\brel\s*=\s*["']?stylesheet/i],
  ["remote image", /<img\b[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i],
  ["remote css url()", /url\(\s*["']?(?:https?:)?\/\//i],
  ["iframe", /<iframe\b/i],
];

const RULES: readonly Rule[] = [
  {
    id: "size-hard",
    description: "File is under 5 MB (AppLovin limit)",
    severity: "error",
    check: (_html, bytes) => ({
      passed: bytes < LIMITS.hardBytes,
      detail: `${bytes} bytes`,
    }),
  },
  {
    id: "size-soft",
    description: "File is under 2 MB (Meta single-file limit)",
    severity: "warning",
    check: (_html, bytes) => ({
      passed: bytes < LIMITS.softBytes,
      detail: `${bytes} bytes`,
    }),
  },
  {
    id: "single-file",
    description: "No external scripts, stylesheets, images or iframes",
    severity: "error",
    check: (html) => {
      const hits = EXTERNAL_RESOURCE_PATTERNS.filter(([, re]) => re.test(html)).map(([name]) => name);
      return { passed: hits.length === 0, detail: hits.length ? hits.join(", ") : "none found" };
    },
  },
  {
    id: "no-network-calls",
    description: "No fetch or XMLHttpRequest calls",
    severity: "error",
    check: (html) => {
      const hits = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bnavigator\.sendBeacon\b/, /\bWebSocket\b/]
        .filter((re) => re.test(html))
        .map((re) => re.source);
      return { passed: hits.length === 0, detail: hits.length ? hits.join(", ") : "none found" };
    },
  },
  {
    id: "mraid-ready",
    description: "Waits for MRAID ready and viewable state",
    severity: "error",
    check: (html) => {
      // Minifiers often rewrite string literals as template literals, so accept backticks too.
      const ok = /\bmraid\b/.test(html) && /viewableChange/.test(html) && /["'`]ready["'`]/.test(html);
      return { passed: ok, detail: ok ? "mraid, ready and viewableChange found" : "missing mraid wiring" };
    },
  },
  {
    id: "store-via-mraid",
    description: "Store is opened with mraid.open, not by redirecting",
    severity: "error",
    check: (html) => {
      const usesOpen = /\.open\s*\(/.test(html) && /\bmraid\b/.test(html);
      const redirects = /\blocation\.(?:href|assign|replace)\s*=|\blocation\.(?:assign|replace)\s*\(/.test(html);
      return {
        passed: usesOpen && !redirects,
        detail: redirects ? "location redirect found" : usesOpen ? "mraid.open used" : "no open call found",
      };
    },
  },
  {
    id: "viewport",
    description: "Has a viewport meta tag",
    severity: "error",
    check: (html) => {
      const ok = /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html);
      return { passed: ok, detail: ok ? "found" : "missing" };
    },
  },
  {
    id: "html-document",
    description: "Is a complete HTML document",
    severity: "error",
    check: (html) => {
      const ok = /<!doctype html>/i.test(html) && /<\/html>\s*$/i.test(html.trim());
      return { passed: ok, detail: ok ? "doctype and closing tag found" : "not a complete document" };
    },
  },
];

export function validatePlayable(html: string, bytes: number): Verdict {
  const rules: RuleResult[] = RULES.map((rule) => {
    try {
      const { passed, detail } = rule.check(html, bytes);
      return { id: rule.id, description: rule.description, severity: rule.severity, passed, detail };
    } catch (error) {
      // Fail closed: a rule that throws is a failure.
      return {
        id: rule.id,
        description: rule.description,
        severity: rule.severity,
        passed: false,
        detail: `rule could not run: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  return {
    passed: rules.every((rule) => rule.passed || rule.severity === "warning"),
    bytes,
    rules,
  };
}
