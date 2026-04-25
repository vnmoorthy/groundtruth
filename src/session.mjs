// src/session.mjs
//
// Claude Code session JSONL parser.
//
// Based on extracted behavior of the claude binary (v2.1.119): each line
// of a session file is a JSON object. Each object has a `type` field
// (typically "user" or "assistant"). Tool results appear as "user" type
// entries containing tool_result content blocks. Meta records have
// `isMeta: true` and should be skipped.
//
// This parser groups records into "turns". A turn consists of an assistant
// response plus any adjacent tool uses and their results produced while
// that response was being generated, until the next user message.

import { readFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** @typedef {{
 *   tool: string,
 *   input: object,
 *   tool_use_id?: string
 * }} ToolUse
 */

/** @typedef {{
 *   tool_use_id: string,
 *   content: string,
 *   is_error?: boolean
 * }} ToolResult
 */

/** @typedef {{
 *   index: number,
 *   timestamp?: string,
 *   kind: "user" | "assistant",
 *   text: string,
 *   tool_uses: ToolUse[],
 *   tool_results: ToolResult[],
 *   raw: any[],
 *   line_start?: number,
 *   line_end?: number
 * }} Turn
 */

function safeParseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function extractTextFromContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
    } else if (block && typeof block === "object") {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  return parts.join("\n");
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  const uses = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "tool_use") {
      uses.push({
        tool: block.name,
        input: block.input || {},
        tool_use_id: block.id,
      });
    }
  }
  return uses;
}

function extractToolResults(content) {
  if (!Array.isArray(content)) return [];
  const results = [];
  for (const block of content) {
    if (block && typeof block === "object" && block.type === "tool_result") {
      results.push({
        tool_use_id: block.tool_use_id,
        content: extractToolResultContent(block.content),
        is_error: block.is_error === true,
      });
    }
  }
  return results;
}

function extractToolResultContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const b of content) {
      if (typeof b === "string") parts.push(b);
      else if (b && typeof b === "object" && typeof b.text === "string") parts.push(b.text);
    }
    return parts.join("\n");
  }
  return "";
}

function extractRecordKind(record) {
  // Some Claude Code records wrap message under `message`, others put role directly.
  const msg = record.message || record;
  const role = msg.role || record.type;
  if (role === "assistant") return "assistant";
  if (role === "user") return "user";
  return null;
}

function getContent(record) {
  const msg = record.message || record;
  return msg.content;
}

/**
 * Parse a session file into turns.
 * @param {string} filePath
 * @returns {Turn[]}
 */
export function parseSessionFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return parseSessionText(raw);
}

/**
 * Parse session JSONL text into turns. Preserves 1-based line numbers
 * (the line in the original JSONL where each record appeared) on the
 * Turn records, so the audit CLI can report file:line.
 * @param {string} text
 * @returns {Turn[]}
 */
export function parseSessionText(text) {
  // We intentionally keep blank/corrupt lines in the enumeration so that
  // the line numbers we report match what a user would see in `head -n`.
  const allLines = text.split("\n");
  /** @type {Turn[]} */
  const turns = [];
  /** @type {Turn | null} */
  let current = null;
  let index = 0;

  for (let i = 0; i < allLines.length; i++) {
    const lineNumber = i + 1;
    const line = allLines[i];
    if (!line || line.trim().length === 0) continue;
    const record = safeParseJson(line);
    if (!record) continue;
    if (record.isMeta === true) continue;

    const kind = extractRecordKind(record);
    if (!kind) continue;

    const content = getContent(record);
    const txt = extractTextFromContent(content);
    const toolUses = extractToolUses(content);
    const toolResults = extractToolResults(content);
    const timestamp = record.timestamp || record.ts || null;

    if (kind === "assistant") {
      if (!current || current.kind !== "assistant") {
        current = {
          index: index++,
          timestamp,
          kind: "assistant",
          text: "",
          tool_uses: [],
          tool_results: [],
          raw: [],
          line_start: lineNumber,
          line_end: lineNumber,
        };
        turns.push(current);
      } else {
        current.line_end = lineNumber;
      }
      if (txt) current.text = current.text ? `${current.text}\n${txt}` : txt;
      current.tool_uses.push(...toolUses);
      current.raw.push(record);
    } else if (kind === "user") {
      if (toolResults.length > 0) {
        if (current && current.kind === "assistant") {
          current.tool_results.push(...toolResults);
          current.raw.push(record);
          current.line_end = lineNumber;
        }
      } else {
        current = {
          index: index++,
          timestamp,
          kind: "user",
          text: txt,
          tool_uses: [],
          tool_results: [],
          raw: [record],
          line_start: lineNumber,
          line_end: lineNumber,
        };
        turns.push(current);
      }
    }
  }
  return turns;
}

/**
 * Build tool observations for an assistant turn, correlating tool_uses
 * with tool_results by tool_use_id.
 * @param {Turn} turn
 * @returns {import("./verifier.mjs").ToolObservation[]}
 */
export function observationsForTurn(turn) {
  const resultsById = new Map();
  for (const r of turn.tool_results) {
    resultsById.set(r.tool_use_id, r);
  }
  const obs = [];
  for (const use of turn.tool_uses) {
    const result = resultsById.get(use.tool_use_id);
    obs.push({
      tool: use.tool,
      input: use.input,
      output: result ? result.content : "",
      exit_code: result && result.is_error ? 1 : 0,
    });
  }
  return obs;
}

export const _internals = {
  extractTextFromContent,
  extractToolUses,
  extractToolResults,
  extractRecordKind,
};
