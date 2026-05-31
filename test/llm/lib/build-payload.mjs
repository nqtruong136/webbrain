// Build the exact LLM request payload WebBrain would send for a given
// (user message, tab, mode) — mirrors the selected browser agent's
// _buildSystemPrompt + _enrichUserMessageWithCurrentPage + getToolsForMode,
// minus the WebExtension-only bits (vision sub-call, screenshot capture,
// adapter re-injection across turns).
//
// We import the prompt constants and tool schemas directly from browser
// source so the payload stays in lock-step with what ships.
//
// FREEZE MODE — set the env var WB_FREEZE_BASELINE to the path of a
// snapshot JSON (see freeze/baseline-2026-05-23.json) to pin the system
// prompt and tools array to a previous run's values, regardless of what
// src/ currently exports. The per-case user message is still computed
// dynamically (URL, title, user prompt). Use this to keep "vs Sonnet"
// comparisons honest as the tool list evolves.

import { readFileSync, existsSync } from 'node:fs';

import {
  SYSTEM_PROMPT_ACT as CHROME_SYSTEM_PROMPT_ACT,
  SYSTEM_PROMPT_ASK as CHROME_SYSTEM_PROMPT_ASK,
  getToolsForMode as chromeGetToolsForMode,
} from '../../../src/chrome/src/agent/tools.js';
import {
  UNIVERSAL_PREAMBLE as CHROME_UNIVERSAL_PREAMBLE,
  getActiveAdapter as chromeGetActiveAdapter,
} from '../../../src/chrome/src/agent/adapters.js';
import {
  SYSTEM_PROMPT_ACT as FIREFOX_SYSTEM_PROMPT_ACT,
  SYSTEM_PROMPT_ASK as FIREFOX_SYSTEM_PROMPT_ASK,
  getToolsForMode as firefoxGetToolsForMode,
} from '../../../src/firefox/src/agent/tools.js';
import {
  UNIVERSAL_PREAMBLE as FIREFOX_UNIVERSAL_PREAMBLE,
  getActiveAdapter as firefoxGetActiveAdapter,
} from '../../../src/firefox/src/agent/adapters.js';

export const DEFAULT_BROWSER = 'chrome';
export const BROWSERS = {
  chrome: {
    SYSTEM_PROMPT_ACT: CHROME_SYSTEM_PROMPT_ACT,
    SYSTEM_PROMPT_ASK: CHROME_SYSTEM_PROMPT_ASK,
    UNIVERSAL_PREAMBLE: CHROME_UNIVERSAL_PREAMBLE,
    getActiveAdapter: chromeGetActiveAdapter,
    getToolsForMode: chromeGetToolsForMode,
  },
  firefox: {
    SYSTEM_PROMPT_ACT: FIREFOX_SYSTEM_PROMPT_ACT,
    SYSTEM_PROMPT_ASK: FIREFOX_SYSTEM_PROMPT_ASK,
    UNIVERSAL_PREAMBLE: FIREFOX_UNIVERSAL_PREAMBLE,
    getActiveAdapter: firefoxGetActiveAdapter,
    getToolsForMode: firefoxGetToolsForMode,
  },
};

export function normalizeBrowser(browser) {
  const key = browser || DEFAULT_BROWSER;
  if (!BROWSERS[key]) {
    throw new Error(`Bad browser: ${browser}. Expected chrome or firefox.`);
  }
  return key;
}

// ── frozen-baseline loader ───────────────────────────────────────────
// One-time load on module init so we can log it once and reuse cheaply.
const FREEZE_PATH = process.env.WB_FREEZE_BASELINE || '';
let FROZEN_BASELINE = null;
if (FREEZE_PATH) {
  if (!existsSync(FREEZE_PATH)) {
    throw new Error(`WB_FREEZE_BASELINE points at missing file: ${FREEZE_PATH}`);
  }
  const parsed = JSON.parse(readFileSync(FREEZE_PATH, 'utf8'));
  if (!parsed?.systemContent || !Array.isArray(parsed?.tools)) {
    throw new Error(`WB_FREEZE_BASELINE file lacks systemContent or tools[]: ${FREEZE_PATH}`);
  }
  FROZEN_BASELINE = parsed;
  console.error(
    `▸ FROZEN baseline loaded: ${FREEZE_PATH}\n` +
    `  source: ${parsed.meta?.sourceRun || '(unknown)'} @ ${parsed.meta?.runTag || '(no tag)'}\n` +
    `  tools=${parsed.tools.length}, systemBytes=${parsed.systemContent.length}, systemHash=${(parsed.meta?.systemHash || '').slice(0,16)}…`
  );
}
export function isFrozen() { return !!FROZEN_BASELINE; }
export function getFrozenMeta() { return FROZEN_BASELINE?.meta || null; }

/**
 * @param {object} caseRec - { id?, mode: 'act'|'ask', tab: {url, title}, user }
 * @param {object} opts    - { useSiteAdapters?: boolean, strictSecretMode?: boolean,
 *                             profile?: {enabled, text}, captchaSolver?: boolean,
 *                             browser?: 'chrome'|'firefox' }
 * @returns {{ messages: Array, tools: Array }}
 */
export function buildPayload(caseRec, opts = {}) {
  const browser = BROWSERS[normalizeBrowser(opts.browser)];
  const mode = caseRec.mode === 'ask' ? 'ask' : 'act';
  const url = caseRec.tab?.url || '';
  const title = caseRec.tab?.title || '';
  const useSiteAdapters = opts.useSiteAdapters !== false;
  const strictSecretMode = !!opts.strictSecretMode;

  // ── system message ───────────────────────────────────────────────────
  // FREEZE MODE: skip ALL system-prompt assembly (incl. adapters, profile,
  // captcha) and use the snapshot verbatim. Whatever site-adapter/profile
  // text was baked into the baseline at capture time is what runs.
  let systemContent;
  if (FROZEN_BASELINE) {
    systemContent = FROZEN_BASELINE.systemContent;
  } else {
    systemContent = mode === 'act' ? browser.SYSTEM_PROMPT_ACT : browser.SYSTEM_PROMPT_ASK;
    if (useSiteAdapters) {
      systemContent += `\n\n${browser.UNIVERSAL_PREAMBLE.trim()}`;
    }
    if (opts.profile?.enabled && opts.profile?.text?.trim()) {
      systemContent +=
        `\n\n[User profile — use these details when a form or signup needs them, INSTEAD of asking the user. The user has opted in to sharing this with you. Do NOT volunteer these details on pages that don't need them, and NEVER reveal the password in chat output or screenshots. Treat it as sensitive.]\n` +
        opts.profile.text.trim();
    }
  }
  if (opts.captchaSolver && !FROZEN_BASELINE) {
    systemContent += `\n\n[CAPTCHA SOLVER — the user has configured CapSolver. When a CAPTCHA blocks a step, call \`solve_captcha\` once (with no arguments — it auto-detects reCAPTCHA v2/v3, hCaptcha, and Cloudflare Turnstile). On success, click the form's submit button and continue. On failure, ask the user to solve it manually — do not retry solve_captcha repeatedly.]`;
  }

  // ── user message (enriched with per-turn context) ────────────────────
  let contextLine = url
    ? `[Current page context — applies to this user message and supersedes older page context for phrases like "this page". URL: ${url}${title ? ` — Title: ${title}` : ''}]\n\n`
    : '';

  if (useSiteAdapters && url) {
    const adapter = browser.getActiveAdapter(url);
    if (adapter) {
      const heading = adapter.category === 'finance'
        ? `[Site guidance for ${adapter.name} — FINANCE / HIGH-STAKES]`
        : `[Site guidance for ${adapter.name}]`;
      contextLine += `${heading}\n${adapter.notes.trim()}\n\n`;
    }
  }

  const userContent = contextLine + caseRec.user;

  // ── tools ────────────────────────────────────────────────────────────
  // FREEZE MODE: use the snapshot's tools verbatim. The strictSecretMode
  // / mode options have no effect on a frozen baseline by design.
  const tools = FROZEN_BASELINE
    ? FROZEN_BASELINE.tools
    : browser.getToolsForMode(mode, { strictSecretMode });

  return {
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    tools,
  };
}
