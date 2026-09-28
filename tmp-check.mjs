const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result ?? m.error);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const STATS = `(() => {
  const pane = document.querySelector('.pane-scroll.overflow-y-auto');
  const vids = [...pane.querySelectorAll('video')];
  const inPane = (v) => { const r = v.getBoundingClientRect(), p = pane.getBoundingClientRect();
    return r.bottom > p.top && r.top < p.bottom; };
  const vis = vids.filter(inPane);
  return {
    scrollTop: Math.round(pane.scrollTop),
    total: vids.length,
    withSrc: vids.filter(v => !!v.getAttribute('src')).length,
    skeletons: pane.querySelectorAll('.animate-pulse').length,
    visible: vis.length,
    visiblePlaying: vis.filter(v => !v.paused).length,
    visibleReady: vis.filter(v => v.readyState >= 2).length,
    visibleWithSrc: vis.filter(v => !!v.getAttribute('src')).length,
  };
})()`;

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3000/spunkram/item/1138" });
await wait(12000);
await evaluate(`document.querySelector('nav[aria-label="Showcase categories"]').scrollIntoView({block:'center'}); 1`);
await wait(6000);

console.log("initial      ", JSON.stringify(await evaluate(STATS)));

await evaluate(`document.querySelector('.pane-scroll.overflow-y-auto').scrollTop = 1400; 1`);
await wait(6000);
console.log("scrolled down", JSON.stringify(await evaluate(STATS)));

await evaluate(`document.querySelector('.pane-scroll.overflow-y-auto').scrollTop = 0; 1`);
await wait(4000);
console.log("scrolled back", JSON.stringify(await evaluate(STATS)));

ws.close();
