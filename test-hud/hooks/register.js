"use strict";
// test-hud: test runs at a glance, the serious cousin of boss-fight.
//
//   runs     every Bash command that starts a known runner (vitest, jest, pytest, maven, gradle,
//            cargo, go, bun, mocha, rspec, an npm test script...) is read for its summary:
//            failed, passed, skipped, and the failing tests by name.
//   status   "✗ tests 41/43 ▃▅█▅▂": the last run and a sparkline of failures over the runner's
//            last 8 runs. ▁ is a green run.
//   toast    when a runner turns green after red runs, once, with how many red runs it took.
//   /tests   opens the pane: the last run, its failing tests (new ones marked), the sparkline and
//            the recent runs. /tests clear drops them; /tests demo seeds a red-to-green streak.
//
// Reads one file: Bash's saved copy of an output too long to show whole, so the summary at its
// end is not lost. Runs no process, calls no model.
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
exports.register = void 0;
var claude_code_1 = require("claude-code");
var hud_1 = require("./hud");
var PANE = 'test-hud';
var PANE_SPARK = 24;
var PANE_RUNS = 10;
var runs = (0, claude_code_1.atom)({ plugin: 'test-hud', key: 'runs' }, []);
var shownStatus;
var show = function ($, list) {
    var text = (0, hud_1.statusText)(list);
    if (text === shownStatus)
        return;
    shownStatus = text;
    $.ui.status(text);
};
// The engine's own note when an output is too long to show whole.
var SAVED = /Full output saved to: (\S+\/tool-results\/\S+)/;
/** The whole output: the engine's saved copy when Bash cut it short, else what the model read. */
var outputOf = function ($, ran) { return __awaiter(void 0, void 0, void 0, function () {
    var rec, saved, full;
    var _a, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                rec = (ran.isError ? undefined : ran.result);
                saved = (_a = rec === null || rec === void 0 ? void 0 : rec.persistedOutputPath) !== null && _a !== void 0 ? _a : (_c = SAVED.exec((_b = ran.text) !== null && _b !== void 0 ? _b : '')) === null || _c === void 0 ? void 0 : _c[1];
                if (!saved) return [3 /*break*/, 2];
                return [4 /*yield*/, $.fs.read(saved).catch(function () { return null; })];
            case 1:
                full = _f.sent();
                if (typeof full === 'string')
                    return [2 /*return*/, full];
                _f.label = 2;
            case 2: return [2 /*return*/, (rec === null || rec === void 0 ? void 0 : rec.stdout) !== undefined ? "".concat(rec.stdout, "\n").concat((_d = rec.stderr) !== null && _d !== void 0 ? _d : '') : ((_e = ran.text) !== null && _e !== void 0 ? _e : '')];
        }
    });
}); };
var add = function ($, parsed, meta) { return __awaiter(void 0, void 0, void 0, function () {
    var run, list, green;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                list = [];
                return [4 /*yield*/, (0, claude_code_1.update)($, runs, function (l) {
                        var _a, _b;
                        run = __assign(__assign(__assign({}, parsed), meta), { n: ((_b = (_a = l.at(-1)) === null || _a === void 0 ? void 0 : _a.n) !== null && _b !== void 0 ? _b : 0) + 1 });
                        list = (0, hud_1.record)(l, run);
                        return list;
                    })];
            case 1:
                _a.sent();
                show($, list);
                green = run && (0, hud_1.greenText)(list, run);
                if (green)
                    $.ui.toast("".concat(green, " /tests"), { timeoutMs: 8000 });
                return [2 /*return*/];
        }
    });
}); };
var DEMO_NAMES = [
    'src/parse.test.ts > parse > handles empty input',
    'src/parse.test.ts > parse > keeps trailing commas',
    'src/auth.test.ts > session > refreshes an expired token',
    'src/auth.test.ts > session > rejects a revoked token',
    'src/cart.test.ts > totals > rounds half up',
    'src/cart.test.ts > totals > applies the coupon once',
    'src/api.test.ts > routes > returns 404 for unknown ids',
];
var DEMO = [
    { failing: [0, 1, 2, 3, 4, 5, 6], ms: 14000 },
    { failing: [0, 1, 2, 3, 6], ms: 12000 },
    { failing: [0, 1, 2, 3, 6, 4], ms: 13000 },
    { failing: [2, 3, 6], ms: 11000 },
    { failing: [6], ms: 12000 },
    { failing: [], ms: 12000 },
];
var runDemo = function ($) { return __awaiter(void 0, void 0, void 0, function () {
    var now, at, _i, DEMO_1, d, failures;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, $.clock.now()];
            case 1:
                now = _a.sent();
                return [4 /*yield*/, (0, claude_code_1.update)($, runs, function (l) { return l.filter(function (r) { return !r.isDemo; }); })];
            case 2:
                _a.sent();
                at = now - 9 * 60000;
                _i = 0, DEMO_1 = DEMO;
                _a.label = 3;
            case 3:
                if (!(_i < DEMO_1.length)) return [3 /*break*/, 6];
                d = DEMO_1[_i];
                at += 90000;
                failures = d.failing.map(function (i) { return DEMO_NAMES[i]; });
                return [4 /*yield*/, add($, { failed: failures.length, passed: 43 - failures.length, skipped: 1, failures: failures }, { runner: 'vitest', command: 'npm test', endedAt: at, durationMs: d.ms, isDemo: true })];
            case 4:
                _a.sent();
                _a.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 3];
            case 6: return [2 /*return*/];
        }
    });
}); };
var register = function (on) {
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    result = _a.sent();
                    return [4 /*yield*/, $.command.register({
                            name: 'tests',
                            description: 'Test runs: /tests opens the pane; /tests clear drops the runs; /tests demo shows fake ones',
                            immediate: true,
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, result];
            }
        });
    }); });
    on('tool.call', { tool: 'Bash' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var runner, start, ran, rec, parsed, _a, _b, end;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    runner = (0, hud_1.runnerOf)(e.command);
                    if (!runner || e.run_in_background)
                        return [2 /*return*/, next(e)];
                    return [4 /*yield*/, $.clock.now()];
                case 1:
                    start = _d.sent();
                    return [4 /*yield*/, next(e)];
                case 2:
                    ran = _d.sent();
                    if (ran.deny !== undefined)
                        return [2 /*return*/, ran];
                    rec = (ran.isError ? undefined : ran.result);
                    if ((rec === null || rec === void 0 ? void 0 : rec.backgroundTaskId) || (rec === null || rec === void 0 ? void 0 : rec.interrupted))
                        return [2 /*return*/, ran];
                    _a = hud_1.parseRun;
                    _b = [runner];
                    return [4 /*yield*/, outputOf($, ran)];
                case 3:
                    parsed = (_c = _a.apply(void 0, _b.concat([_d.sent()]))) !== null && _c !== void 0 ? _c : (ran.isError ? null : (0, hud_1.quietPass)(runner));
                    if (!parsed)
                        return [2 /*return*/, ran];
                    return [4 /*yield*/, $.clock.now()];
                case 4:
                    end = _d.sent();
                    return [4 /*yield*/, add($, parsed, __assign({ runner: runner, command: (0, hud_1.commandLine)(e.command), endedAt: end, durationMs: end - start }, (e.agentId ? { agentId: e.agentId } : {})))];
                case 5:
                    _d.sent();
                    return [2 /*return*/, ran];
            }
        });
    }); }).catch(function ($, e, next) { return next(e); }); // an observer: fail open, the call's result stands
    on('command.run', { command: 'tests' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var arg, opened, list, r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    arg = e.args.trim().toLowerCase();
                    if (!(arg === 'clear')) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, claude_code_1.update)($, runs, function () { return []; })];
                case 1:
                    _a.sent();
                    show($, []);
                    return [2 /*return*/, { text: 'Test runs cleared.' }];
                case 2:
                    if (!(arg === 'demo')) return [3 /*break*/, 5];
                    return [4 /*yield*/, runDemo($)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, $.ui.open({ id: PANE, title: 'Tests' }).catch(function () { return null; })];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { text: 'Six demo runs added, red to green. /tests clear removes them.' }];
                case 5: return [4 /*yield*/, $.ui.open({ id: PANE, title: 'Tests' }).catch(function () { return null; })];
                case 6:
                    opened = _a.sent();
                    if (opened === null || opened === void 0 ? void 0 : opened.isPlaced)
                        return [2 /*return*/, {}];
                    return [4 /*yield*/, (0, claude_code_1.read)($, runs)];
                case 7:
                    list = _a.sent();
                    r = list.at(-1);
                    if (!r)
                        return [2 /*return*/, { text: 'No test runs yet this session.' }];
                    return [2 /*return*/, { text: "Last run: ".concat(r.runner, " ").concat((0, hud_1.score)(r)).concat(r.failed ? ", ".concat(r.failed, " failed") : '', ". ").concat((0, hud_1.spark)((0, hud_1.trail)(list))).concat(r.failures.length ? " Failing: ".concat(r.failures.slice(0, 5).join('; '), ".") : '') }];
            }
        });
    }); });
    on('ui.render', { component: 'Pane', requestId: PANE }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var _a, Box, Text, Button, list, width, r, isRed, counts, line, most, isNew, recent;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = $.ui.resolve(e), Box = _a.Box, Text = _a.Text, Button = _a.Button;
                    return [4 /*yield*/, (0, claude_code_1.read)($, runs)];
                case 1:
                    list = _c.sent();
                    width = Math.max(40, (e.props.bodyColumns || ((_b = e.viewport) === null || _b === void 0 ? void 0 : _b.columns) || 80) - 2);
                    r = list.at(-1);
                    if (!r) {
                        return [2 /*return*/, (<Box flexDirection="column" paddingX={1}>
          <Text dimColor>No test runs yet this session. Test commands run in Bash show here.</Text>
          <Text dimColor>/tests demo shows what this looks like.</Text>
        </Box>)];
                    }
                    isRed = r.failed > 0;
                    counts = [
                        r.passed === null ? (isRed ? '' : 'passed, no counts printed') : "".concat(r.passed, "/").concat(r.passed + r.failed, " passing"),
                        isRed ? "".concat(r.failed, " failed") : '',
                        r.skipped ? "".concat(r.skipped, " skipped") : '',
                    ].filter(Boolean);
                    line = (0, hud_1.trail)(list, PANE_SPARK);
                    most = Math.max.apply(Math, line.map(function (x) { return x.failed; }));
                    isNew = (0, hud_1.fresh)(list, r);
                    recent = list.slice(-PANE_RUNS).reverse();
                    return [2 /*return*/, (<Box flexDirection="column" paddingX={1} gap={1}>
        <Box flexDirection="column">
          <Text>
            <Text color={isRed ? 'red' : 'green'} bold>{"".concat(isRed ? '✗' : '✓', " ").concat(counts.join(' · '))}</Text>
          </Text>
          <Text dimColor>{(0, hud_1.clip)("".concat(r.runner, " \u00B7 #").concat(r.n, " \u00B7 ").concat((0, hud_1.elapsed)(r.durationMs)).concat(r.agentId ? ' · subagent' : '', " \u00B7 ").concat(r.command), width)}</Text>
        </Box>

        <Text>
          <Text color={isRed ? 'red' : 'green'}>{(0, hud_1.spark)(line)}</Text>
          <Text dimColor>{"  failures over the last ".concat(line.length, " ").concat(r.runner, " run").concat(line.length === 1 ? '' : 's').concat(most ? " (most ".concat(most, ")") : '')}</Text>
        </Text>

        {isRed && (<Box flexDirection="column">
            <Text bold>{"Failing".concat(r.failures.length ? " (".concat(r.failures.length).concat(r.failures.length < r.failed ? " of ".concat(r.failed) : '', ")") : '')}</Text>
            {r.failures.length === 0 && <Text dimColor>  The output named no failing tests in a shape this mod reads.</Text>}
            {r.failures.map(function (f) { return (<Text key={f}>
                <Text color="red">{'  ✗ '}</Text>
                <Text>{(0, hud_1.clip)(f, width - 10)}</Text>
                {isNew.has(f) && <Text color="yellow">{'  new'}</Text>}
              </Text>); })}
          </Box>)}

        <Box flexDirection="column">
          <Text bold>Runs</Text>
          {recent.map(function (x) { return (<Text key={String(x.n)}>
              <Text dimColor>{"  #".concat(String(x.n).padEnd(4))}</Text>
              <Text>{x.runner.padEnd(8)}</Text>
              <Text color={x.failed ? 'red' : 'green'}>{(0, hud_1.score)(x).padEnd(10)}</Text>
              <Text dimColor>{"".concat((0, hud_1.elapsed)(x.durationMs).padStart(7), "  ").concat((0, hud_1.clip)(x.command, Math.max(10, width - 36))).concat(x.agentId ? ' (subagent)' : '')}</Text>
            </Text>); })}
        </Box>

        <Box gap={2}>
          <Button key="clear" label="clear runs" onPress={function () { return (0, claude_code_1.update)($, runs, function () { return []; }).then(function () { return show($, []); }); }}/>
        </Box>
      </Box>)];
            }
        });
    }); });
};
exports.register = register;
