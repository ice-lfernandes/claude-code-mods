"use strict";
// Pure test-run bookkeeping: no engine, so the tests drive it directly.
// The summary shapes follow boss-fight's parser (OneWave-AI/claude-code-mods, MIT), with Maven
// (surefire and failsafe), Gradle, skipped counts and failing test names added.
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.elapsed = exports.clip = exports.commandLine = exports.greenText = exports.statusText = exports.score = exports.trail = exports.spark = exports.fresh = exports.previous = exports.record = exports.quietPass = exports.parseRun = exports.failingNames = exports.runnerOf = exports.SPARK_RUNS = void 0;
var MAX_RUNS = 30;
var MAX_NAMES = 20;
exports.SPARK_RUNS = 8;
// Where a command starts: line start or after ; & | ( , past env assignments, wrappers and a path.
var LEAD = String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["(?:^|[;&|(])s*(?:w+=S*s+)*(?:(?:npx|bunx|pnpm(?:s+exec)?|yarn|uvs+run|poetrys+run|pipenvs+run|hatchs+run|bundles+exec|time|nice|timeouts+S+)s+)*(?:[w.~-]*/)*"], ["(?:^|[;&|(])\\s*(?:\\w+=\\S*\\s+)*(?:(?:npx|bunx|pnpm(?:\\s+exec)?|yarn|uv\\s+run|poetry\\s+run|pipenv\\s+run|hatch\\s+run|bundle\\s+exec|time|nice|timeout\\s+\\S+)\\s+)*(?:[\\w.~-]*\\/)*"])));
var at = function (body) { return new RegExp(LEAD + body, 'm'); };
var RUNNERS = [
    ['maven', at(String.raw(templateObject_2 || (templateObject_2 = __makeTemplateObject(["mvnw?(?:.cmd)?\b(?=[^;&|\n]*\b(?:test|verify|install|package|integration-test|surefire:test)\b)(?![^;&|\n]*-D(?:skipTests|maven.test.skip)\b)"], ["mvnw?(?:\\.cmd)?\\b(?=[^;&|\\n]*\\b(?:test|verify|install|package|integration-test|surefire:test)\\b)(?![^;&|\\n]*-D(?:skipTests|maven\\.test\\.skip)\\b)"]))))],
    ['gradle', at(String.raw(templateObject_3 || (templateObject_3 = __makeTemplateObject(["gradlew?(?:.bat)?\b(?=[^;&|\n]*[s:](?:w*[tT]est|check|build)\b)(?![^;&|\n]*(?:-x|--exclude-task)s+:?test\b)"], ["gradlew?(?:\\.bat)?\\b(?=[^;&|\\n]*[\\s:](?:\\w*[tT]est|check|build)\\b)(?![^;&|\\n]*(?:-x|--exclude-task)\\s+:?test\\b)"]))))],
    ['vitest', at(String.raw(templateObject_4 || (templateObject_4 = __makeTemplateObject(["vitest\b"], ["vitest\\b"]))))],
    ['jest', at(String.raw(templateObject_5 || (templateObject_5 = __makeTemplateObject(["jest\b"], ["jest\\b"]))))],
    ['pytest', at(String.raw(templateObject_6 || (templateObject_6 = __makeTemplateObject(["(?:pytest|py.test|python3?s+-ms+pytest)\b"], ["(?:pytest|py\\.test|python3?\\s+-m\\s+pytest)\\b"]))))],
    ['bun', at(String.raw(templateObject_7 || (templateObject_7 = __makeTemplateObject(["buns+test\b"], ["bun\\s+test\\b"]))))],
    ['cargo', at(String.raw(templateObject_8 || (templateObject_8 = __makeTemplateObject(["cargos+(?:test|nextest)\b"], ["cargo\\s+(?:test|nextest)\\b"]))))],
    ['go', at(String.raw(templateObject_9 || (templateObject_9 = __makeTemplateObject(["gos+test\b"], ["go\\s+test\\b"]))))],
    ['claude', at(String.raw(templateObject_10 || (templateObject_10 = __makeTemplateObject(["claudes+plugins+test\b"], ["claude\\s+plugin\\s+test\\b"]))))],
    ['mocha', at(String.raw(templateObject_11 || (templateObject_11 = __makeTemplateObject(["mocha\b"], ["mocha\\b"]))))],
    ['rspec', at(String.raw(templateObject_12 || (templateObject_12 = __makeTemplateObject(["rspec\b"], ["rspec\\b"]))))],
    ['npm', at(String.raw(templateObject_13 || (templateObject_13 = __makeTemplateObject(["(?:npm|pnpm|yarn|bun)s+(?:runs+)?(?:test|t)(?::[w:-]+)?(?=[s;&|)]|$)"], ["(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:test|t)(?::[\\w:-]+)?(?=[\\s;&|)]|$)"]))))],
];
/** Which runner a Bash command starts, or null when it runs no tests. */
var runnerOf = function (command) {
    for (var _i = 0, RUNNERS_1 = RUNNERS; _i < RUNNERS_1.length; _i++) {
        var _a = RUNNERS_1[_i], name_1 = _a[0], re = _a[1];
        if (re.test(command))
            return name_1;
    }
    return null;
};
exports.runnerOf = runnerOf;
var ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
var num = function (re, s) { var _a, _b; return Number((_b = (_a = re.exec(s)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : 0); };
/** The last match's number: summaries come last, so it wins over per-file lines. */
var last = function (text, re) {
    var out = null;
    for (var _i = 0, _a = text.matchAll(re); _i < _a.length; _i++) {
        var m = _a[_i];
        out = Number(m[1]);
    }
    return out;
};
/** Failing tests by name, in the shapes the common runners print. Deduplicated, at most 20. */
var failingNames = function (text) {
    var shapes = [
        /^\s*● (.+?)\s*$/gm, // jest
        /^\s*FAIL\s+(.+ > .+?)\s*$/gm, // vitest
        /^(?:FAILED|ERROR) (\S+::\S+)/gm, // pytest
        /^\[ERROR\]\s{2,}([\w$]+(?:[.>][\w$[\]]+)+)(?=[:\s]|$)/gm, // maven
        /^(\S.*? > .+?) FAILED\s*$/gm, // gradle
        /^test (\S+) \.\.\. FAILED\s*$/gm, // cargo
        /^\s*--- FAIL: (\S+)/gm, // go
        /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?\s*$/gm, // bun, claude plugin test
        /^rspec \S+ # (.+?)\s*$/gm, // rspec
    ];
    var seen = new Set();
    for (var _i = 0, shapes_1 = shapes; _i < shapes_1.length; _i++) {
        var re = shapes_1[_i];
        for (var _a = 0, _b = text.matchAll(re); _a < _b.length; _a++) {
            var m = _b[_a];
            var name_2 = m[1].trim();
            if (name_2 === 'Console' || seen.has(name_2))
                continue;
            seen.add(name_2);
            if (seen.size === MAX_NAMES)
                return __spreadArray([], seen, true).map(function (n) { return (0, exports.clip)(n, 100); });
        }
    }
    return __spreadArray([], seen, true).map(function (n) { return (0, exports.clip)(n, 100); });
};
exports.failingNames = failingNames;
/**
 * Counts from a runner's output, tolerant of the common summary shapes. Null when the output
 * carries no summary at all.
 */
var parseRun = function (runner, raw) {
    var text = raw.replace(ANSI, '').replace(/\r/g, '');
    var counts = summary(runner, text);
    return counts && __assign(__assign({}, counts), { failures: counts.failed ? (0, exports.failingNames)(text) : [] });
};
exports.parseRun = parseRun;
var summary = function (runner, text) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    // maven: one "Tests run: 43, Failures: 1, Errors: 1, Skipped: 2" per module, after the
    // per-class lines (which go on with ", Time elapsed"): add the modules up.
    var maven = __spreadArray([], text.matchAll(/^(?:\[(?:INFO|WARNING|ERROR)\]\s+)?Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)\s*$/gm), true);
    if (maven.length) {
        var _j = [1, 2, 3, 4].map(function (i) { return maven.reduce(function (n, m) { return n + Number(m[i]); }, 0); }), run = _j[0], failures = _j[1], errors = _j[2], skipped = _j[3];
        return { failed: failures + errors, passed: run - failures - errors - skipped, skipped: skipped };
    }
    // gradle prints counts only when something failed: "43 tests completed, 2 failed, 1 skipped".
    var gradle = __spreadArray([], text.matchAll(/^\s*(\d+) tests? completed(?:, (\d+) failed)?(?:, (\d+) skipped)?/gm), true);
    if (gradle.length) {
        var _k = [1, 2, 3].map(function (i) { return gradle.reduce(function (n, m) { var _a; return n + Number((_a = m[i]) !== null && _a !== void 0 ? _a : 0); }, 0); }), done = _k[0], failed = _k[1], skipped = _k[2];
        return { failed: failed, passed: done - failed - skipped, skipped: skipped };
    }
    // jest: "Tests:       2 failed, 1 skipped, 5 passed, 8 total"
    var jest = (_a = /^\s*Tests:\s+(.*\d+ total)/m.exec(text)) === null || _a === void 0 ? void 0 : _a[1];
    if (jest)
        return { failed: num(/(\d+) failed/, jest), passed: num(/(\d+) passed/, jest), skipped: num(/(\d+) skipped/, jest) + num(/(\d+) todo/, jest) };
    // vitest: "Tests  2 failed | 5 passed | 1 skipped (8)"
    var vitest = (_b = /^\s*Tests\s+(.*?(?:failed|passed).*?)\s*\(\d+\)\s*$/m.exec(text)) === null || _b === void 0 ? void 0 : _b[1];
    if (vitest)
        return { failed: num(/(\d+) failed/, vitest), passed: num(/(\d+) passed/, vitest), skipped: num(/(\d+) skipped/, vitest) + num(/(\d+) todo/, vitest) };
    // cargo: "test result: FAILED. 3 passed; 2 failed; 1 ignored;" once per crate: add them.
    var cargo = __spreadArray([], text.matchAll(/test result: \w+\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored/g), true);
    if (cargo.length) {
        var _l = [1, 2, 3].map(function (i) { return cargo.reduce(function (n, m) { return n + Number(m[i]); }, 0); }), passed = _l[0], failed = _l[1], skipped = _l[2];
        return { failed: failed, passed: passed, skipped: skipped };
    }
    // bun, claude plugin test: " 12 pass\n 1 fail"
    var pass = last(text, /^\s*(\d+) pass\s*$/gm);
    var fail = last(text, /^\s*(\d+) fail\s*$/gm);
    if (pass !== null || fail !== null)
        return { failed: fail !== null && fail !== void 0 ? fail : 0, passed: pass !== null && pass !== void 0 ? pass : 0, skipped: (_c = last(text, /^\s*(\d+) skip\s*$/gm)) !== null && _c !== void 0 ? _c : 0 };
    // pytest: "=== 2 failed, 5 passed, 1 skipped in 0.12s ===", or the same bare with -q.
    var py = (_d = /^[=\s]*(\d+ (?:failed|passed|errors?|skipped|xfailed|xpassed|deselected|warnings?)\b.*?) in [\d.]+s\b/m.exec(text)) === null || _d === void 0 ? void 0 : _d[1];
    if (py)
        return { failed: num(/(\d+) failed/, py) + num(/(\d+) errors?/, py), passed: num(/(\d+) passed/, py), skipped: num(/(\d+) skipped/, py) };
    if (/^=+ no tests ran\b/m.test(text))
        return { failed: 0, passed: 0, skipped: 0 };
    // mocha: "5 passing", "2 failing", "1 pending"
    var passing = last(text, /^\s*(\d+) passing\b/gm);
    var failing = last(text, /^\s*(\d+) failing\b/gm);
    if (passing !== null || failing !== null)
        return { failed: failing !== null && failing !== void 0 ? failing : 0, passed: passing !== null && passing !== void 0 ? passing : 0, skipped: (_e = last(text, /^\s*(\d+) pending\b/gm)) !== null && _e !== void 0 ? _e : 0 };
    // rspec: "7 examples, 2 failures, 1 pending"
    var rspec = /(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/.exec(text);
    if (rspec) {
        var _m = [rspec[1], rspec[2], rspec[3]].map(function (n) { return Number(n !== null && n !== void 0 ? n : 0); }), all = _m[0], failed = _m[1], skipped = _m[2];
        return { failed: failed, passed: all - failed - skipped, skipped: skipped };
    }
    // go: "--- FAIL: TestX" per failing top-level test; "--- PASS" only with -v.
    if (runner === 'go') {
        var fails = ((_f = text.match(/^--- FAIL:/gm)) !== null && _f !== void 0 ? _f : []).length;
        var passes = ((_g = text.match(/^--- PASS:/gm)) !== null && _g !== void 0 ? _g : []).length;
        var failed = fails || (/^FAIL\b/m.test(text) ? 1 : 0);
        if (failed || passes)
            return { failed: failed, passed: passes || null, skipped: ((_h = text.match(/^--- SKIP:/gm)) !== null && _h !== void 0 ? _h : []).length };
        if (/^ok\s/m.test(text))
            return { failed: 0, passed: null, skipped: 0 };
    }
    return null;
};
/**
 * A run with no summary still says something when the runner stays quiet on success: Gradle
 * always, Maven with -q. Exit 0 then reads as green with no counts.
 */
var quietPass = function (runner) {
    return runner === 'gradle' || runner === 'maven' ? { failed: 0, passed: null, skipped: 0, failures: [] } : null;
};
exports.quietPass = quietPass;
var record = function (list, run) {
    var next = __spreadArray(__spreadArray([], list, true), [run], false);
    return next.length > MAX_RUNS ? next.slice(next.length - MAX_RUNS) : next;
};
exports.record = record;
/** The run of the same runner before `run`. */
var previous = function (list, run) {
    return list.filter(function (r) { return r.runner === run.runner && r.n < run.n; }).at(-1);
};
exports.previous = previous;
/** Failing tests of `run` that were not failing in the runner's run before it. */
var fresh = function (list, run) {
    var prev = (0, exports.previous)(list, run);
    // An earlier run that failed without names we could read says nothing about which are new.
    if (!prev || (prev.failed > 0 && prev.failures.length === 0))
        return new Set();
    return new Set(run.failures.filter(function (f) { return !prev.failures.includes(f); }));
};
exports.fresh = fresh;
var LEVELS = '▂▃▄▅▆▇█';
/** Failures per run, oldest first: ▁ is a green run, ▂ to █ scale to the most failures. */
var spark = function (list) {
    var max = Math.max.apply(Math, __spreadArray([0], list.map(function (r) { return r.failed; }), false));
    return list.map(function (r) { return (r.failed === 0 ? '▁' : LEVELS[Math.min(6, Math.ceil((r.failed / max) * 7) - 1)]); }).join('');
};
exports.spark = spark;
/** The last runs of the latest run's runner, for the sparkline. */
var trail = function (list, size) {
    if (size === void 0) { size = exports.SPARK_RUNS; }
    var latest = list.at(-1);
    return latest ? list.filter(function (r) { return r.runner === latest.runner; }).slice(-size) : [];
};
exports.trail = trail;
/** "41/43", "2 failed", "pass". */
var score = function (r) { return (r.passed === null ? (r.failed ? "".concat(r.failed, " failed") : 'pass') : "".concat(r.passed, "/").concat(r.passed + r.failed)); };
exports.score = score;
/** "✗ tests 41/43 ▃▅█▅▂", or undefined before any run. */
var statusText = function (list) {
    var r = list.at(-1);
    if (!r)
        return undefined;
    var line = (0, exports.spark)((0, exports.trail)(list));
    return "".concat(r.failed ? '✗' : '✓', " tests ").concat((0, exports.score)(r)).concat(line.length > 1 ? " ".concat(line) : '');
};
exports.statusText = statusText;
/** The toast for a run that turned its runner green after red runs, else null. */
var greenText = function (list, run) {
    if (run.failed > 0)
        return null;
    var same = list.filter(function (r) { return r.runner === run.runner && r.n < run.n; });
    var reds = 0;
    while (reds < same.length && same[same.length - 1 - reds].failed > 0)
        reds++;
    if (reds === 0)
        return null;
    var first = same[same.length - reds];
    var span = (0, exports.elapsed)(run.endedAt - (first.endedAt - first.durationMs));
    return "Tests green: ".concat((0, exports.score)(run), " (").concat(run.runner, ") after ").concat(reds, " red run").concat(reds === 1 ? '' : 's', " in ").concat(span, ".");
};
exports.greenText = greenText;
/** The command's first line, clipped. */
var commandLine = function (command) { return (0, exports.clip)(command.split('\n')[0].trim(), 60); };
exports.commandLine = commandLine;
var clip = function (s, n) { return (s.length > n ? "".concat(s.slice(0, n - 1), "\u2026") : s); };
exports.clip = clip;
/** 42s, 6m 05s, 1h 02m. */
var elapsed = function (ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60)
        return "".concat(s, "s");
    var m = Math.floor(s / 60);
    if (m < 60)
        return "".concat(m, "m ").concat(String(s % 60).padStart(2, '0'), "s");
    return "".concat(Math.floor(m / 60), "h ").concat(String(m % 60).padStart(2, '0'), "m");
};
exports.elapsed = elapsed;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13;
