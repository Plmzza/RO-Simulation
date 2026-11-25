/**
 * Runs the (simplified) rAthena C++ skill-ratio code from data/skills.json.
 * Supports the subset used by calculateSkillRatio(): var declarations, if/else, switch, for/while, ternary,
 * C integer arithmetic (integer division truncates), member access (S.pow, SD.status.job_level, SC.getSCE(..).val1),
 * and the helper functions listed in FUNCS. Unknown identifiers evaluate to their own name (e.g. RC_DEMON),
 * which is how races/elements are compared.
 */

const TOKEN = /\s*(?:(0[xX][0-9a-fA-F]+|\d+\.\d*|\.\d+|\d+)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([A-Za-z_]\w*)|(<<=|>>=|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|::|[-+*/%<>=!&|^~?:;,(){}\[\].]))/y;

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(start))) break; throw new SyntaxError('bad char near ' + src.slice(start, start + 15)); }
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]), f: m[1].includes('.') });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].slice(1, -1) });
    else if (m[3] !== undefined) out.push({ t: 'id', v: m[3] });
    else out.push({ t: 'op', v: m[4] });
  }
  out.push({ t: 'eof' });
  return out;
}

function parse(tokens) {
  let i = 0;
  const peek = (o = 0) => tokens[i + o];
  const next = () => tokens[i++];
  const isOp = (v) => tokens[i].t === 'op' && tokens[i].v === v;
  const isId = (v) => tokens[i].t === 'id' && tokens[i].v === v;
  const expect = (v) => { if (!isOp(v)) throw new SyntaxError(`expected ${v} got ${tokens[i].v ?? tokens[i].t}`); i++; };

  function statement() {
    if (isOp('{')) { next(); const list = []; while (!isOp('}')) list.push(statement()); next(); return { k: 'block', list }; }
    if (isOp(';')) { next(); return { k: 'nop' }; }
    if (isId('if')) {
      next(); expect('('); const c = expr(); expect(')'); const a = statement();
      let b = null; if (isId('else')) { next(); b = statement(); }
      return { k: 'if', c, a, b };
    }
    if (isId('for')) {
      next(); expect('(');
      const init = isOp(';') ? null : (isId('var') ? declaration(false) : expr()); expect(';');
      const c = isOp(';') ? null : expr(); expect(';');
      const step = isOp(')') ? null : expr(); expect(')');
      return { k: 'loop', init, c, step, body: statement() };
    }
    if (isId('while')) { next(); expect('('); const c = expr(); expect(')'); return { k: 'loop', c, body: statement() }; }
    if (isId('switch')) {
      next(); expect('('); const v = expr(); expect(')'); expect('{');
      const cases = [];
      while (!isOp('}')) {
        const labels = [];
        while (isId('case') || isId('default')) {
          if (next().v === 'case') { labels.push(expr()); } else labels.push(null);
          expect(':');
        }
        const body = [];
        while (!isOp('}') && !isId('case') && !isId('default')) body.push(statement());
        cases.push({ labels, body });
      }
      next();
      return { k: 'switch', v, cases };
    }
    if (isId('break')) { next(); expect(';'); return { k: 'break' }; }
    if (isId('return')) { next(); const e = isOp(';') ? null : expr(); expect(';'); return { k: 'return', e }; }
    if (isId('var')) { const d = declaration(true); return d; }
    const e = expr(); expect(';');
    return { k: 'expr', e };
  }
  function declaration(semi) {
    next();                                   // 'var'
    const list = [];
    do {
      while (isOp('*') || isOp('&')) next();
      const name = next().v;
      let init = null;
      if (isOp('[')) { while (!isOp(']')) next(); next(); }
      if (isOp('=')) { next(); init = assign(); }
      list.push({ name, init });
      if (isOp(',')) next(); else break;
    } while (true);
    if (semi) expect(';');
    return { k: 'var', list };
  }
  const BIN = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function expr() { let e = assign(); while (isOp(',')) { next(); e = { k: 'seq', a: e, b: assign() }; } return e; }
  function assign() {
    const left = ternary();
    if (peek().t === 'op' && /^(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/.test(peek().v)) {
      const op = next().v; return { k: 'assign', op, target: left, value: assign() };
    }
    return left;
  }
  function ternary() {
    const c = binary(0);
    if (isOp('?')) { next(); const a = assign(); expect(':'); const b = assign(); return { k: 'cond', c, a, b }; }
    return c;
  }
  function binary(l) {
    if (l >= BIN.length) return unary();
    let a = binary(l + 1);
    while (peek().t === 'op' && BIN[l].includes(peek().v)) { const op = next().v; a = { k: 'bin', op, a, b: binary(l + 1) }; }
    return a;
  }
  function unary() {
    if (peek().t === 'op' && ['-', '+', '!', '~', '*', '&'].includes(peek().v)) {
      const op = next().v; const a = unary();
      return op === '*' || op === '&' ? a : { k: 'un', op, a };
    }
    if (isOp('++') || isOp('--')) { const op = next().v; const t = unary(); return { k: 'assign', op: op[0] + '=', target: t, value: { k: 'num', v: 1 } }; }
    return postfix(primary());
  }
  function postfix(e) {
    for (;;) {
      if (isOp('.') || isOp('::')) { next(); e = { k: 'member', obj: e, name: next().v }; continue; }
      if (isOp('[')) { next(); const idx = expr(); expect(']'); e = { k: 'index', obj: e, idx }; continue; }
      if (isOp('(')) {
        next(); const args = [];
        if (!isOp(')')) { args.push(assign()); while (isOp(',')) { next(); args.push(assign()); } }
        expect(')'); e = { k: 'call', fn: e, args }; continue;
      }
      if (isOp('++') || isOp('--')) { const op = next().v; e = { k: 'assign', op: op[0] + '=', target: e, value: { k: 'num', v: 1 }, post: true }; continue; }
      return e;
    }
  }
  function primary() {
    const t = next();
    if (t.t === 'num') return { k: 'num', v: t.v, f: t.f };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'id') return { k: 'id', name: t.v };
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e; }
    throw new SyntaxError(`unexpected ${t.v ?? t.t}`);
  }
  const list = [];
  while (peek().t !== 'eof') list.push(statement());
  return { k: 'block', list };
}

const cache = new Map();
export function compileRatio(src) {
  if (!cache.has(src)) {
    try { cache.set(src, { ast: parse(tokenize(src)) }); } catch (e) { cache.set(src, { error: String(e.message || e) }); }
  }
  return cache.get(src);
}

class Break {}
class Return { constructor(v) { this.v = v; } }

/**
 * @param src  ratio code from skills.json
 * @param ctx  { skillratio, skill_lv, S, T, SD, TSD, SC, TSC, WD, MFLAG, constants, funcs: { name: fn } }
 * @returns { skillratio, unsupported: [] }
 */
export function runRatio(src, ctx) {
  return runVar(src, ctx, 'skillratio', ctx.skillratio);
}

/** Same as runRatio but for any output variable (e.g. 'hit_rate' for modifyHitRate code). */
export function runVar(src, ctx, outName, initial) {
  const prog = compileRatio(src);
  const unsupported = [];
  if (prog.error) return { value: initial, skillratio: initial, unsupported: ['parse: ' + prog.error] };
  const scopes = [Object.create(null)];
  scopes[0][outName] = initial;
  if (ctx.skill_lv !== undefined) scopes[0].skill_lv = ctx.skill_lv;
  let steps = 0;
  const isInt = (x) => typeof x === 'number' && Number.isInteger(x);

  const lookup = (name) => {
    for (let s = scopes.length - 1; s >= 0; s--) if (name in scopes[s]) return scopes[s][name];
    if (name in ctx.vars) return ctx.vars[name];
    if (name === 'true') return 1;
    if (name === 'false' || name === 'null') return 0;
    if (ctx.constants && name in ctx.constants) return ctx.constants[name];
    return name;
  };
  const store = (target, v) => {
    if (target.k === 'id') {
      for (let s = scopes.length - 1; s >= 0; s--) if (target.name in scopes[s]) { scopes[s][target.name] = v; return; }
      scopes[0][target.name] = v; return;
    }
    if (target.k === 'member') { const o = val(target.obj); if (o && typeof o === 'object') o[target.name] = v; return; }
  };
  const num = (x) => (typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0);
  function val(e) {
    if (++steps > 50000) throw new Error('too many steps');
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return e.v;
      case 'id': return lookup(e.name);
      case 'seq': val(e.a); return val(e.b);
      case 'member': { const o = val(e.obj); return o && typeof o === 'object' ? (o[e.name] ?? 0) : 0; }
      case 'index': { const o = val(e.obj); const i = val(e.idx); return o && typeof o === 'object' ? (o[i] ?? 0) : 0; }
      case 'un': { const a = val(e.a); return e.op === '-' ? -num(a) : e.op === '!' ? (a ? 0 : 1) : e.op === '~' ? ~num(a) : num(a); }
      case 'cond': return val(e.c) ? val(e.a) : val(e.b);
      case 'bin': return bin(e.op, e.a, e.b);
      case 'assign': {
        const cur = num(val(e.target));
        let v = val(e.value);
        if (e.op !== '=') v = arith(e.op.slice(0, -1), cur, num(v));
        if (e.target.k === 'id' && e.target.name === outName) v = Math.trunc(num(v));
        store(e.target, v);
        return e.post ? cur : v;
      }
      case 'call': return call(e);
    }
    return 0;
  }
  function arith(op, x, y) {
    switch (op) {
      case '+': return x + y; case '-': return x - y; case '*': return x * y;
      case '/': return y === 0 ? 0 : (isInt(x) && isInt(y) ? Math.trunc(x / y) : x / y);
      case '%': return y === 0 ? 0 : x % y;
      case '<<': return x << y; case '>>': return x >> y; case '&': return x & y; case '|': return x | y; case '^': return x ^ y;
    }
    return 0;
  }
  function bin(op, ea, eb) {
    if (op === '&&') return val(ea) && val(eb) ? 1 : 0;
    if (op === '||') return val(ea) || val(eb) ? 1 : 0;
    const a = val(ea), b = val(eb);
    if (op === '==') return a === b || (typeof a === 'number' && typeof b === 'number' && a === b) ? 1 : 0;
    if (op === '!=') return a === b ? 0 : 1;
    const x = num(a), y = num(b);
    switch (op) {
      case '<': return x < y ? 1 : 0; case '<=': return x <= y ? 1 : 0;
      case '>': return x > y ? 1 : 0; case '>=': return x >= y ? 1 : 0;
    }
    return arith(op, x, y);
  }
  function call(e) {
    // method call: obj.name(args)
    if (e.fn.k === 'member') {
      const o = val(e.fn.obj);
      const args = e.args.map(val);
      if (o && typeof o[e.fn.name] === 'function') return o[e.fn.name](...args);
      return 0;
    }
    const name = e.fn.k === 'id' ? e.fn.name : '';
    const f = ctx.funcs[name];
    if (f) return f(...e.args.map((a) => (a.k === 'id' && !(a.name in scopes[0]) && !(ctx.vars && a.name in ctx.vars)
      && !(ctx.constants && a.name in ctx.constants) && /^[A-Z][A-Z0-9_]*$/.test(a.name) ? a.name : val(a))));
    if (name === 'RE_LVL_DMOD') {
      const v = num(val(e.args[0])); const lv = ctx.funcs.status_get_lv('src');
      if (lv > 99 && v > 0) store({ k: 'id', name: outName }, Math.trunc(num(lookup(outName)) * lv / v));
      return 0;
    }
    if (!unsupported.includes(name)) unsupported.push(name);
    return 0;
  }
  function exec(s) {
    if (++steps > 50000) throw new Error('too many steps');
    switch (s.k) {
      case 'block': scopes.push(Object.create(null)); try { for (const x of s.list) exec(x); } finally { scopes.pop(); } return;
      case 'nop': return;
      case 'if': if (val(s.c)) exec(s.a); else if (s.b) exec(s.b); return;
      case 'var': for (const d of s.list) scopes[scopes.length - 1][d.name] = d.init ? val(d.init) : 0; return;
      case 'expr': val(s.e); return;
      case 'break': throw new Break();
      case 'return': throw new Return(s.e ? val(s.e) : undefined);
      case 'loop': {
        scopes.push(Object.create(null));
        try {
          if (s.init) s.init.k === 'var' ? exec(s.init) : val(s.init);
          let guard = 0;
          while ((s.c ? val(s.c) : 1) && guard++ < 1000) { exec(s.body); if (s.step) val(s.step); }
        } catch (e) { if (!(e instanceof Break)) throw e; } finally { scopes.pop(); }
        return;
      }
      case 'switch': {
        const v = val(s.v);
        let on = false;
        try {
          for (const c of s.cases) {
            if (!on) on = c.labels.some((l) => l === null || val(l) === v);
            if (on) for (const b of c.body) exec(b);
          }
          if (!on) { const d = s.cases.find((c) => c.labels.includes(null)); if (d) for (const b of d.body) exec(b); }
        } catch (e) { if (!(e instanceof Break)) throw e; }
        return;
      }
    }
  }
  let returned;
  try { exec(prog.ast); }
  catch (e) {
    if (e instanceof Return) returned = e.v;
    else unsupported.push('runtime: ' + (e.message || e));
  }
  const value = Math.trunc(num(ctx.useReturn && returned !== undefined ? returned : scopes[0][outName]));
  return { value, skillratio: value, returned, scope: scopes[0], unsupported };
}
