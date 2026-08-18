"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_LEVELS = void 0;
exports.isLogLevel = isLogLevel;
exports.LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
function isLogLevel(value) {
    return exports.LOG_LEVELS.includes(value);
}
