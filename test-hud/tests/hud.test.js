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
var testing_1 = require("claude-code/testing");
var hud_1 = require("../hooks/hud");
var NOW = Date.parse('2026-10-08T12:00:00Z');
var MIN = 60000;
var run = function (n, failed, over) {
    if (over === void 0) { over = {}; }
    return (__assign({ n: n, runner: 'vitest', command: 'npm test', failed: failed, passed: 43 - failed, skipped: 0, failures: [], endedAt: NOW + n * MIN, durationMs: 10000 }, over));
};
(0, testing_1.describe)('runners', function () {
    (0, testing_1.test)('commands that start a test runner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var cases, _i, cases_1, _a, command, runner;
        return __generator(this, function (_b) {
            cases = [
                ['npx vitest run', 'vitest'],
                ['pnpm vitest --run src/a.test.ts', 'vitest'],
                ['npx jest --ci', 'jest'],
                ['./node_modules/.bin/jest', 'jest'],
                ['python -m pytest -q tests/', 'pytest'],
                ['uv run pytest', 'pytest'],
                ['./mvnw -q test', 'maven'],
                ['cd api && mvn clean verify -pl core', 'maven'],
                ['./gradlew :app:test --tests FooTest', 'gradle'],
                ['./gradlew build', 'gradle'],
                ['cargo test --workspace', 'cargo'],
                ['go test ./...', 'go'],
                ['bun test', 'bun'],
                ['claude plugin test ./test-hud', 'claude'],
                ['bundle exec rspec spec/models', 'rspec'],
                ['npm test 2>&1 | tail -40', 'npm'],
                ['CI=1 pnpm run test:unit', 'npm'],
                ['yarn test', 'npm'],
            ];
            for (_i = 0, cases_1 = cases; _i < cases_1.length; _i++) {
                _a = cases_1[_i], command = _a[0], runner = _a[1];
                (0, testing_1.expect)("".concat(command, " -> ").concat((0, hud_1.runnerOf)(command))).toBe("".concat(command, " -> ").concat(runner));
            }
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('commands that only mention one', function () { return __awaiter(void 0, void 0, void 0, function () {
        var _i, _a, command;
        return __generator(this, function (_b) {
            for (_i = 0, _a = [
                'grep -r jest package.json',
                'cat vitest.config.ts',
                'git commit -m "fix: pytest fixture"',
                'mvn -DskipTests package',
                './mvnw spring-boot:run',
                './gradlew build -x test',
                './gradlew bootRun',
                'cargo build',
                'npm run testing-library',
                'echo go test',
            ]; _i < _a.length; _i++) {
                command = _a[_i];
                (0, testing_1.expect)("".concat(command, " -> ").concat((0, hud_1.runnerOf)(command))).toBe("".concat(command, " -> null"));
            }
            return [2 /*return*/];
        });
    }); });
});
(0, testing_1.describe)('summaries', function () {
    (0, testing_1.test)('maven adds up the modules and skips the per-class lines', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = [
                '[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.05 s -- in com.acme.FooTest',
                '[ERROR] Tests run: 3, Failures: 1, Errors: 1, Skipped: 0, Time elapsed: 0.1 s <<< FAILURE! -- in com.acme.BarTest',
                '[ERROR] Failures: ',
                '[ERROR]   BarTest.divide:23 expected: <2> but was: <3>',
                '[ERROR] Errors: ',
                '[ERROR]   BarTest.parse:41 » NullPointer',
                '[INFO] ',
                '[ERROR] Tests run: 8, Failures: 1, Errors: 1, Skipped: 0',
                '[INFO] Tests run: 35, Failures: 0, Errors: 0, Skipped: 2',
                '[INFO] BUILD FAILURE',
            ].join('\n');
            (0, testing_1.expect)((0, hud_1.parseRun)('maven', out)).toEqual({ failed: 2, passed: 39, skipped: 2, failures: ['BarTest.divide', 'BarTest.parse'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('gradle reads its failure line and the failing tests', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = 'CalcTest > divide() FAILED\n    org.opentest4j.AssertionFailedError at CalcTest.java:12\n\n43 tests completed, 2 failed, 1 skipped\n\nFAILURE: Build failed';
            (0, testing_1.expect)((0, hud_1.parseRun)('gradle', out)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['CalcTest > divide()'] });
            (0, testing_1.expect)((0, hud_1.parseRun)('gradle', 'BUILD SUCCESSFUL in 4s')).toBe(null);
            (0, testing_1.expect)((0, hud_1.quietPass)('gradle')).toEqual({ failed: 0, passed: null, skipped: 0, failures: [] });
            (0, testing_1.expect)((0, hud_1.quietPass)('vitest')).toBe(null);
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('jest', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = '  ● parse › handles empty input\n\n  ● parse › keeps commas\n\nTest Suites: 1 failed, 3 passed, 4 total\nTests:       2 failed, 1 skipped, 40 passed, 43 total';
            (0, testing_1.expect)((0, hud_1.parseRun)('jest', out)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['parse › handles empty input', 'parse › keeps commas'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('vitest, colored', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = '\u001b[31m FAIL \u001b[39m src/a.test.ts > parse > empty\n\n Test Files  1 failed | 3 passed (4)\n      Tests  \u001b[31m1 failed\u001b[39m | 41 passed | 1 skipped (43)\n   Duration  1.2s';
            (0, testing_1.expect)((0, hud_1.parseRun)('vitest', out)).toEqual({ failed: 1, passed: 41, skipped: 1, failures: ['src/a.test.ts > parse > empty'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('pytest, with and without -q', function () { return __awaiter(void 0, void 0, void 0, function () {
        var full;
        return __generator(this, function (_a) {
            full = 'FAILED tests/test_a.py::test_x - assert 1 == 2\nERROR tests/test_b.py::test_y\n=========== 1 failed, 40 passed, 1 skipped, 1 error in 0.52s ===========';
            (0, testing_1.expect)((0, hud_1.parseRun)('pytest', full)).toEqual({ failed: 2, passed: 40, skipped: 1, failures: ['tests/test_a.py::test_x', 'tests/test_b.py::test_y'] });
            (0, testing_1.expect)((0, hud_1.parseRun)('pytest', '43 passed in 0.31s')).toEqual({ failed: 0, passed: 43, skipped: 0, failures: [] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('cargo adds up the crates', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = 'test tests::adds ... ok\ntest tests::divides ... FAILED\ntest result: FAILED. 9 passed; 1 failed; 0 ignored; 0 measured\ntest result: ok. 30 passed; 0 failed; 2 ignored; 0 measured';
            (0, testing_1.expect)((0, hud_1.parseRun)('cargo', out)).toEqual({ failed: 1, passed: 39, skipped: 2, failures: ['tests::divides'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('go, with and without -v', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            (0, testing_1.expect)((0, hud_1.parseRun)('go', '--- FAIL: TestParse (0.00s)\n    --- FAIL: TestParse/empty (0.00s)\nFAIL\tacme/parse\t0.01s')).toEqual({ failed: 1, passed: null, skipped: 0, failures: ['TestParse', 'TestParse/empty'] });
            (0, testing_1.expect)((0, hud_1.parseRun)('go', 'ok  \tacme/parse\t0.01s')).toEqual({ failed: 0, passed: null, skipped: 0, failures: [] });
            (0, testing_1.expect)((0, hud_1.parseRun)('go', '--- PASS: TestA (0.00s)\n--- PASS: TestB (0.00s)\nok  \tacme\t0.1s')).toEqual({ failed: 0, passed: 2, skipped: 0, failures: [] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('bun and claude plugin test', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = '(pass) a > one [0.2ms]\n(fail) a > two [0.3ms]\n\n 16 pass\n 1 fail\nRan 17 tests across 2 files.';
            (0, testing_1.expect)((0, hud_1.parseRun)('claude', out)).toEqual({ failed: 1, passed: 16, skipped: 0, failures: ['a > two'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('mocha and rspec', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            (0, testing_1.expect)((0, hud_1.parseRun)('mocha', '  12 passing (40ms)\n  1 pending\n  2 failing')).toEqual({ failed: 2, passed: 12, skipped: 1, failures: [] });
            (0, testing_1.expect)((0, hud_1.parseRun)('rspec', '7 examples, 2 failures, 1 pending\n\nrspec ./spec/a_spec.rb:4 # A adds')).toEqual({ failed: 2, passed: 4, skipped: 1, failures: ['A adds'] });
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('no summary, no run', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            (0, testing_1.expect)((0, hud_1.parseRun)('npm', 'npm ERR! missing script: test')).toBe(null);
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('failing names stop at 20', function () { return __awaiter(void 0, void 0, void 0, function () {
        var out;
        return __generator(this, function (_a) {
            out = Array.from({ length: 30 }, function (_, i) { return "FAILED tests/test_a.py::test_".concat(i); }).join('\n');
            (0, testing_1.expect)((0, hud_1.failingNames)(out).length).toBe(20);
            return [2 /*return*/];
        });
    }); });
});
(0, testing_1.describe)('runs', function () {
    (0, testing_1.test)('the sparkline scales failures and keeps green runs at the floor', function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            (0, testing_1.expect)((0, hud_1.spark)([run(1, 7), run(2, 5), run(3, 1), run(4, 0)])).toBe('█▆▂▁');
            (0, testing_1.expect)((0, hud_1.spark)([])).toBe('');
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('the status line follows the latest runner', function () { return __awaiter(void 0, void 0, void 0, function () {
        var list;
        return __generator(this, function (_a) {
            list = [run(1, 0, { runner: 'pytest' }), run(2, 4), run(3, 2)];
            (0, testing_1.expect)((0, hud_1.trail)(list).map(function (r) { return r.n; })).toEqual([2, 3]);
            (0, testing_1.expect)((0, hud_1.statusText)(list)).toBe('✗ tests 41/43 █▅');
            (0, testing_1.expect)((0, hud_1.statusText)([run(1, 0)])).toBe('✓ tests 43/43');
            (0, testing_1.expect)((0, hud_1.statusText)([run(1, 0, { runner: 'gradle', passed: null })])).toBe('✓ tests pass');
            (0, testing_1.expect)((0, hud_1.statusText)([])).toBe(undefined);
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('green after red toasts once, with the streak', function () { return __awaiter(void 0, void 0, void 0, function () {
        var list;
        return __generator(this, function (_a) {
            list = [run(1, 0), run(2, 3), run(3, 1), run(4, 0)];
            (0, testing_1.expect)((0, hud_1.greenText)(list, list[3])).toBe('Tests green: 43/43 (vitest) after 2 red runs in 2m 10s.');
            (0, testing_1.expect)((0, hud_1.greenText)(list, list[0])).toBe(null);
            (0, testing_1.expect)((0, hud_1.greenText)(__spreadArray(__spreadArray([], list, true), [run(5, 0)], false), run(5, 0))).toBe(null);
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('new failures are the ones the runner did not fail on before', function () { return __awaiter(void 0, void 0, void 0, function () {
        var list;
        return __generator(this, function (_a) {
            list = [run(1, 1, { failures: ['a'] }), run(2, 2, { failures: ['a', 'b'] })];
            (0, testing_1.expect)(__spreadArray([], (0, hud_1.fresh)(list, list[1]), true)).toEqual(['b']);
            (0, testing_1.expect)((0, hud_1.fresh)([run(1, 3), list[1]], list[1]).size).toBe(0);
            return [2 /*return*/];
        });
    }); });
    (0, testing_1.test)('only the last 30 runs are kept', function () { return __awaiter(void 0, void 0, void 0, function () {
        var list, n;
        return __generator(this, function (_a) {
            list = [];
            for (n = 1; n <= 35; n++)
                list = (0, hud_1.record)(list, run(n, 0));
            (0, testing_1.expect)(list.length).toBe(30);
            (0, testing_1.expect)(list[0].n).toBe(6);
            return [2 /*return*/];
        });
    }); });
});
