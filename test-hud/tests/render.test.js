"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var NOW = Date.parse('2026-10-08T12:00:00Z');
var PROPS = { title: 'Tests', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} };
var RUN = { command: 'tests', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } };
var RED = ' FAIL  src/a.test.ts > parse > empty\n FAIL  src/a.test.ts > parse > commas\n\n      Tests  2 failed | 41 passed (43)';
var GREEN = '      Tests  43 passed (43)';
var _loop_1 = function (surface) {
    (0, testing_1.test)("status line, pane and green toast on ".concat(surface), function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
        var clock, toasts, statuses, output, pane, drawn, _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    clock = testing_1.mock.clock(on, { now: NOW });
                    toasts = [];
                    statuses = [];
                    output = RED;
                    on('ui.open', function () { return ({ value: { isPlaced: true } }); });
                    on('ui.toast', function (_$, e) { return (toasts.push(e.text), { value: undefined }); });
                    on('ui.status', function (_$, e) { return (statuses.push(e.text), { value: undefined }); });
                    on('command.register', function () { return ({ value: undefined }); });
                    on('session.start', function () { return ({ cwd: '/repo' }); });
                    on('tool.call', (function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, clock.advance(12000)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/, output === RED ? { result: undefined, text: "Exit code 1\n".concat(output), isError: true } : { result: { stdout: output, stderr: '', interrupted: false }, text: output }];
                            }
                        });
                    }); }));
                    return [4 /*yield*/, $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })];
                case 1:
                    _k.sent();
                    return [4 /*yield*/, $.tool.call({ tool: 'Bash', command: 'ls src', tool_use_id: 'tu0' })];
                case 2:
                    _k.sent();
                    (0, testing_1.expect)(statuses).toEqual([]);
                    return [4 /*yield*/, $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu1' })];
                case 3:
                    _k.sent();
                    (0, testing_1.expect)(statuses.at(-1)).toBe('✗ tests 41/43');
                    return [4 /*yield*/, $.command.run(RUN)];
                case 4:
                    _k.sent();
                    return [4 /*yield*/, $.ui.mount({ plugin: 'test-hud', surface: surface, component: 'Pane', requestId: 'test-hud', props: PROPS, viewport: { columns: 102, rows: 40 } })];
                case 5:
                    pane = _k.sent();
                    _b = (_a = JSON).stringify;
                    return [4 /*yield*/, pane.drawn()];
                case 6:
                    drawn = _b.apply(_a, [_k.sent()]);
                    (0, testing_1.expect)(drawn).toContain('41/43 passing');
                    (0, testing_1.expect)(drawn).toContain('2 failed');
                    (0, testing_1.expect)(drawn).toContain('src/a.test.ts > parse > commas');
                    (0, testing_1.expect)(drawn).toContain('vitest · #1 · 12s');
                    output = RED.replace('parse > commas', 'parse > quotes');
                    return [4 /*yield*/, $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu2', agentId: 'a1' })];
                case 7:
                    _k.sent();
                    _d = (_c = JSON).stringify;
                    return [4 /*yield*/, pane.drawn()];
                case 8:
                    drawn = _d.apply(_c, [_k.sent()]);
                    (0, testing_1.expect)(drawn).toContain('parse > quotes');
                    (0, testing_1.expect)(drawn).toContain('new');
                    (0, testing_1.expect)(drawn).toContain('subagent');
                    output = GREEN;
                    return [4 /*yield*/, $.tool.call({ tool: 'Bash', command: 'npx vitest run', tool_use_id: 'tu3' })];
                case 9:
                    _k.sent();
                    (0, testing_1.expect)(statuses.at(-1)).toBe('✓ tests 43/43 ██▁');
                    (0, testing_1.expect)(toasts).toEqual(['Tests green: 43/43 (vitest) after 2 red runs in 36s. /tests']);
                    _f = (_e = JSON).stringify;
                    return [4 /*yield*/, pane.drawn()];
                case 10:
                    drawn = _f.apply(_e, [_k.sent()]);
                    (0, testing_1.expect)(drawn).toContain('43/43 passing');
                    (0, testing_1.expect)(drawn).not.toContain('Failing');
                    return [4 /*yield*/, pane.press({ key: 'clear' })];
                case 11:
                    _k.sent();
                    (0, testing_1.expect)(statuses.at(-1)).toBe(undefined);
                    _g = testing_1.expect;
                    _j = (_h = JSON).stringify;
                    return [4 /*yield*/, pane.drawn()];
                case 12:
                    _g.apply(void 0, [_j.apply(_h, [_k.sent()])]).toContain('No test runs yet');
                    return [4 /*yield*/, pane.unmount()];
                case 13:
                    _k.sent();
                    return [2 /*return*/];
            }
        });
    }); });
};
for (var _i = 0, _a = ['terminal', 'desktop']; _i < _a.length; _i++) {
    var surface = _a[_i];
    _loop_1(surface);
}
(0, testing_1.test)('demo runs red to green, clear removes them', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
    var toasts, statuses, pane, _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                testing_1.mock.clock(on, { now: NOW });
                toasts = [];
                statuses = [];
                on('ui.open', function () { return ({ value: { isPlaced: true } }); });
                on('ui.toast', function (_$, e) { return (toasts.push(e.text), { value: undefined }); });
                on('ui.status', function (_$, e) { return (statuses.push(e.text), { value: undefined }); });
                return [4 /*yield*/, $.command.run(__assign(__assign({}, RUN), { args: 'demo' }))];
            case 1:
                _g.sent();
                (0, testing_1.expect)(statuses.at(-1)).toBe('✓ tests 43/43 █▆▇▄▂▁');
                (0, testing_1.expect)(toasts).toEqual(['Tests green: 43/43 (vitest) after 5 red runs in 7m 44s. /tests']);
                return [4 /*yield*/, $.ui.mount({ plugin: 'test-hud', surface: 'terminal', component: 'Pane', requestId: 'test-hud', props: PROPS, viewport: { columns: 102, rows: 40 } })];
            case 2:
                pane = _g.sent();
                _a = testing_1.expect;
                _c = (_b = JSON).stringify;
                return [4 /*yield*/, pane.drawn()];
            case 3:
                _a.apply(void 0, [_c.apply(_b, [_g.sent()])]).toContain('#6');
                return [4 /*yield*/, $.command.run(__assign(__assign({}, RUN), { args: 'clear' }))];
            case 4:
                _g.sent();
                _d = testing_1.expect;
                _f = (_e = JSON).stringify;
                return [4 /*yield*/, pane.drawn()];
            case 5:
                _d.apply(void 0, [_f.apply(_e, [_g.sent()])]).toContain('No test runs yet');
                return [4 /*yield*/, pane.unmount()];
            case 6:
                _g.sent();
                return [2 /*return*/];
        }
    });
}); });
