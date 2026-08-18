"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_BATCH = void 0;
exports.validateLogEntry = validateLogEntry;
const constants_1 = require("./constants");
const MAX_FUTURE_MS = 5 * 60 * 1000;
exports.MAX_BATCH = 10_000;
/**
 * Hand-rolled, single-pass validation instead of a Zod schema. This runs on
 * every entry of every ingest batch — up to 10,000 times per request, millions
 * of times over a sustained load test — and the app container is capped at
 * 0.5 CPU. A Zod schema with chained `.refine()`s (each re-running Date.parse)
 * plus a separate `.refine()` pass over `attributes` measurably cost real
 * throughput here (~22k → ~12k logs/sec in testing, at the same CPU cap) — a
 * single imperative pass with no schema-tree walk or intermediate result
 * objects recovers it.
 */
function validateLogEntry(raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return { ok: false, reason: 'entry must be an object' };
    }
    const e = raw;
    if (typeof e.timestamp !== 'string') {
        return { ok: false, reason: 'timestamp is required' };
    }
    const ts = Date.parse(e.timestamp);
    if (Number.isNaN(ts)) {
        return { ok: false, reason: 'invalid timestamp' };
    }
    if (ts > Date.now() + MAX_FUTURE_MS) {
        return { ok: false, reason: 'timestamp must not be more than five minutes in the future' };
    }
    if (typeof e.level !== 'string' || !(0, constants_1.isLogLevel)(e.level)) {
        return { ok: false, reason: `invalid level: '${String(e.level)}', expected one of ${constants_1.LOG_LEVELS.join(', ')}` };
    }
    if (typeof e.service !== 'string' || e.service.length === 0) {
        return { ok: false, reason: 'service is required and must be a non-empty string' };
    }
    if (typeof e.message !== 'string' || e.message.length === 0) {
        return { ok: false, reason: 'message is required and must be a non-empty string' };
    }
    let attributes;
    if (e.attributes !== undefined) {
        if (typeof e.attributes !== 'object' || e.attributes === null || Array.isArray(e.attributes)) {
            return { ok: false, reason: 'attributes must be a flat object; nested objects and arrays are not allowed' };
        }
        const attrs = e.attributes;
        for (const key in attrs) {
            const v = attrs[key];
            if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
                return { ok: false, reason: 'attributes must be a flat object; nested objects and arrays are not allowed' };
            }
        }
        attributes = attrs;
    }
    return {
        ok: true,
        entry: { timestamp: e.timestamp, level: e.level, service: e.service, message: e.message, attributes },
    };
}
