import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../hooks/use-generations.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const balance = total => ({ total_generations_left: total, subscription_generations_left: total - 5, extra_generations_left: 5, plan: "creator_ai", effective_limit: 100 });
function fixture() {
  let user = { id: 1 };
  let active;
  const pending = [];
  const window = new EventTarget();
  const react = {
    useContext: () => true,
    useState(initial) {
      const i = active.index++;
      const h = active;
      if (!(i in h.slots)) h.slots[i] = initial;
      return [h.slots[i], next => { h.slots[i] = typeof next === "function" ? next(h.slots[i]) : next; }];
    },
    useRef(initial) {
      const i = active.index++;
      if (!(i in active.slots)) active.slots[i] = { current: initial };
      return active.slots[i];
    },
    useCallback(callback, deps) {
      const i = active.index++;
      const previous = active.slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) active.slots[i] = { deps, callback };
      return active.slots[i].callback;
    },
    useEffect(effect, deps) {
      const i = active.index++;
      const previous = active.slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
        const h = active;
        h.effects.push(() => { previous?.cleanup?.(); h.slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({ window, CustomEvent, console, fetch: () => new Promise(resolve => pending.push(resolve)) });
  vm.runInContext(`(function(require,module,exports){${source}\n})`, context)(id => {
    if (id === "react") return react;
    if (id === "@/components/auth-provider") return { useAuth: () => ({ user }) };
    if (id === "@/components/ai-workspace-context") return { AiWorkspaceActiveContext: {} };
    throw new Error(`Unexpected dependency ${id}`);
  }, module, module.exports);
  function mount() {
    const h = { slots: [], index: 0, effects: [] };
    h.render = () => {
      active = h; h.index = 0; h.effects = [];
      const result = module.exports.useGenerations();
      for (const effect of h.effects) effect();
      return result;
    };
    return h;
  }
  const settle = async (resolve, status = balance(100)) => {
    resolve({ ok: true, status: 200, json: async () => status });
    await new Promise(resolve => setImmediate(resolve));
  };
  return { mount, pending, settle, setUser: value => { user = value; }, window };
}

test("the sidebar receives server-debited tool balances without another request", async () => {
  const f = fixture();
  const sidebar = f.mount(); const tool = f.mount();
  sidebar.render(); tool.render();
  await f.settle(f.pending[0]); await f.settle(f.pending[1]);
  assert.equal(sidebar.render().status.total_generations_left, 100);
  const requestCount = f.pending.length;
  tool.render().setStatus(balance(97));
  assert.equal(sidebar.render().status.total_generations_left, 97);
  assert.equal(sidebar.render().status.extra_generations_left, 5);
  assert.equal(f.pending.length, requestCount);
});
test("switching accounts hides the old balance and ignores in-flight responses and old callbacks", async () => {
  const f = fixture(); const sidebar = f.mount();
  const old = sidebar.render();
  f.setUser({ id: 2 });
  assert.equal(sidebar.render().status, null);
  old.setStatus(balance(999));
  await f.settle(f.pending[0], balance(999));
  assert.equal(sidebar.render().status, null);
  await f.settle(f.pending[1], balance(20));
  assert.equal(sidebar.render().status.total_generations_left, 20);
});
test("signing out clears the balance without requesting guest quota", async () => {
  const f = fixture(); const sidebar = f.mount(); sidebar.render();
  await f.settle(f.pending[0]);
  f.setUser(null); sidebar.render();
  assert.equal(sidebar.render().status, null);
  assert.equal(sidebar.render().authenticated, false);
  assert.equal(f.pending.length, 1);
});
test("a newer tool update wins over an older in-flight refresh", async () => {
  const f = fixture(); const sidebar = f.mount(); const tool = f.mount();
  sidebar.render(); tool.render();
  tool.render().setStatus(balance(42));
  await f.settle(f.pending[0], balance(100));
  assert.equal(sidebar.render().status.total_generations_left, 42);
});
