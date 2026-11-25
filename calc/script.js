/**
 * Tiny interpreter for the subset of rAthena item scripts used by equipment, cards and combos.
 * It only collects bonuses (bonus .. bonus5); everything else (skills, autobonus, effects) is ignored
 * and reported in `ignored`.
 *
 * Usage:
 *   const prog = compile(scriptText);            // cache this per item
 *   const out = run(prog, ctx);                  // { bonuses: [[name, ...args]], ignored: [...] }
 *
 * ctx = {
 *   constants: {...},                // numeric constants (constants.json)
 *   param(name) -> number,           // BaseLevel, JobLevel, Class, BaseJob, BaseClass, Upper, Sex ...
 *   readparam(name) -> number,       // readparam(bStr) etc.
 *   refine(slot?) -> number,         // getrefine() for current item / getequiprefinerycnt(EQI_x)
 *   grade(slot?) -> number,          // getenchantgrade()
 *   skill(name) -> number,           // getskilllv()
 *   equipId(slot) -> number,         // getequipid(EQI_x)
 *   itemInfo(id, type) -> number,    // getiteminfo(id, ITEMINFO_x)
 *   eaclass(classId?) -> number,     // pc_jobid2mapid
 *   isEquipped(ids) -> bool,
 * }
 */

// ---------------------------------------------------------------- tokenizer
const TOKEN = /\s*(?:(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(0x[0-9a-fA-F]+|\d+)|("(?:\\.|[^"\\])*")|([.$@']*[A-Za-z_][\w]*\$?)|(<<=|>>=|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|[-+*/%<>=!&|^~?:;,(){}\[\]]))/y;

function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const start = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(start))) break;
      throw new SyntaxError(`Unexpected character near: ${src.slice(start, start + 20)}`);
    }
    if (m[1]) continue;                                    // comment
    if (m[2]) out.push({ t: 'num', v: Number(m[2]) });
    else if (m[3]) out.push({ t: 'str', v: JSON.parse(m[3]) });
    else if (m[4]) out.push({ t: 'id', v: m[4] });
    else if (m[5]) out.push({ t: 'op', v: m[5] });
  }
  out.push({ t: 'eof' });
  return out;
}

// ---------------------------------------------------------------- parser -> AST
function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const is = (v) => tokens[i].t === 'op' && tokens[i].v === v;
  const isId = (v) => tokens[i].t === 'id' && tokens[i].v === v;
  const expect = (v) => { if (!is(v)) throw new SyntaxError(`Expected '${v}' but got '${tokens[i].v ?? tokens[i].t}'`); i++; };

  function block() {
    const list = [];
    while (!is('}') && peek().t !== 'eof') list.push(statement());
    return { k: 'block', list };
  }

  function statement() {
    if (is('{')) { next(); const b = block(); expect('}'); return b; }
    if (is(';')) { next(); return { k: 'nop' }; }
    if (isId('if')) {
      next(); expect('('); const cond = expr(); expect(')');
      const then = statement();
      let other = null;
      if (isId('else')) { next(); other = statement(); }
      return { k: 'if', cond, then, other };
    }
    if (isId('for')) {
      next(); expect('(');
      const init = is(';') ? null : expr(); expect(';');
      const cond = is(';') ? null : expr(); expect(';');
      const step = is(')') ? null : expr(); expect(')');
      return { k: 'for', init, cond, step, body: statement() };
    }
    if (isId('while')) { next(); expect('('); const cond = expr(); expect(')'); return { k: 'for', cond, body: statement() }; }
    if (isId('switch')) {                                      // rare; evaluated as if/else chain
      next(); expect('('); const value = expr(); expect(')'); expect('{');
      const cases = [];
      while (!is('}')) {
        let test = null;
        if (isId('case')) { next(); test = expr(); expect(':'); } else if (isId('default')) { next(); expect(':'); }
        const body = [];
        while (!is('}') && !isId('case') && !isId('default')) {
          if (isId('break')) { next(); expect(';'); body.push({ k: 'break' }); continue; }
          body.push(statement());
        }
        cases.push({ test, body });
      }
      expect('}');
      return { k: 'switch', value, cases };
    }
    if (isId('end') || isId('break') || isId('close')) { const v = next().v; if (is(';')) next(); return { k: v === 'break' ? 'break' : 'end' }; }
    if (isId('set')) {                                          // set .@x, expr;
      next(); const target = next().v; expect(','); const value = expr(); expect(';');
      return { k: 'expr', e: { k: 'assign', op: '=', name: target, value } };
    }
    // command: identifier followed by arguments without parentheses, e.g. "bonus bStr,5;"
    if (peek().t === 'id' && !tokens[i + 1].v?.match?.(/^(=|\+=|-=|\*=|\/=|%=|\+\+|--|\(|\[)$/)) {
      const name = next().v;
      const args = [];
      if (!is(';')) { args.push(expr()); while (is(',')) { next(); args.push(expr()); } }
      expect(';');
      return { k: 'cmd', name, args };
    }
    const e = expr(); expect(';');
    return { k: 'expr', e };
  }

  // precedence climbing
  const BIN = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  function expr() { return assign(); }
  function assign() {
    const left = ternary();
    if (left.k === 'var' && peek().t === 'op' && /^(=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/.test(peek().v)) {
      const op = next().v;
      return { k: 'assign', op, name: left.name, value: assign() };
    }
    return left;
  }
  function ternary() {
    const c = binary(0);
    if (is('?')) { next(); const a = assign(); expect(':'); const b = assign(); return { k: 'cond', c, a, b }; }
    return c;
  }
  function binary(level) {
    if (level >= BIN.length) return unary();
    let left = binary(level + 1);
    while (peek().t === 'op' && BIN[level].includes(peek().v)) {
      const op = next().v;
      left = { k: 'bin', op, a: left, b: binary(level + 1) };
    }
    return left;
  }
  function unary() {
    if (peek().t === 'op' && ['-', '!', '~', '+'].includes(peek().v)) { const op = next().v; return { k: 'un', op, a: unary() }; }
    if (peek().t === 'op' && (peek().v === '++' || peek().v === '--')) { const op = next().v; const v = primary(); return { k: 'assign', op: op[0] + '=', name: v.name, value: { k: 'num', v: 1 } }; }
    const p = primary();
    if (p.k === 'var' && peek().t === 'op' && (peek().v === '++' || peek().v === '--')) {
      const op = next().v; return { k: 'assign', op: op[0] + '=', name: p.name, value: { k: 'num', v: 1 }, post: true };
    }
    return p;
  }
  function primary() {
    const tk = next();
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'op' && tk.v === '(') { const e = expr(); expect(')'); return e; }
    if (tk.t === 'id') {
      if (is('(')) {
        next(); const args = [];
        if (!is(')')) { args.push(expr()); while (is(',')) { next(); args.push(expr()); } }
        expect(')');
        return { k: 'call', name: tk.v, args };
      }
      return { k: 'var', name: tk.v };
    }
    throw new SyntaxError(`Unexpected token '${tk.v ?? tk.t}'`);
  }

  const list = [];
  while (peek().t !== 'eof') list.push(statement());
  return { k: 'block', list };
}

export function compile(src) {
  try { return { ast: parse(tokenize(src || '')) }; }
  catch (e) { return { error: String(e.message || e), src }; }
}

// ---------------------------------------------------------------- evaluator
class Stop {}
class Break {}
const BONUS_CMD = /^bonus[2-5]?$/;
const IGNORED_FUNCS = new Set(['hateffect', 'specialeffect', 'specialeffect2', 'sc_start', 'sc_start2', 'sc_start4', 'sc_end',
  'heal', 'percentheal', 'itemheal', 'skill', 'autobonus', 'autobonus2', 'autobonus3', 'bonus_script', 'getitem', 'setunitdata']);

export function run(prog, ctx) {
  const out = { bonuses: [], ignored: [], auto: [], grants: [] };
  if (!prog || prog.error) { if (prog?.error) out.ignored.push('parse error: ' + prog.error); return out; }
  const vars = Object.create(null);
  let steps = 0;

  const val = (e) => {
    if (++steps > 20000) throw new Error('script too long');
    switch (e.k) {
      case 'num': case 'str': return e.v;
      case 'var': return lookup(e.name);
      case 'un': { const a = val(e.a); return e.op === '-' ? -a : e.op === '!' ? (a ? 0 : 1) : e.op === '~' ? ~a : +a; }
      case 'bin': return bin(e.op, e.a, e.b);
      case 'cond': return val(e.c) ? val(e.a) : val(e.b);
      case 'assign': {
        const cur = lookup(e.name), v = val(e.value);
        const ops = { '=': () => v, '+=': () => cur + v, '-=': () => cur - v, '*=': () => cur * v, '/=': () => Math.trunc(cur / v),
          '%=': () => cur % v, '&=': () => cur & v, '|=': () => cur | v, '^=': () => cur ^ v, '<<=': () => cur << v, '>>=': () => cur >> v };
        vars[e.name] = typeof v === 'string' && e.op === '=' ? v : num(ops[e.op]());
        return e.post ? cur : vars[e.name];
      }
      case 'call': return call(e.name, e.args);
    }
    return 0;
  };
  const num = (x) => (typeof x === 'number' ? Math.trunc(x) : Number(x) || 0);
  function bin(op, ea, eb) {
    if (op === '&&') return val(ea) && val(eb) ? 1 : 0;
    if (op === '||') return val(ea) || val(eb) ? 1 : 0;
    const a = val(ea), b = val(eb);
    if (typeof a === 'string' || typeof b === 'string') {      // string / unresolved-symbol comparisons
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
      if (op === '+') return String(a) + String(b);
    }
    const x = num(a), y = num(b);
    switch (op) {
      case '+': return x + y; case '-': return x - y; case '*': return x * y;
      case '/': return y === 0 ? 0 : Math.trunc(x / y); case '%': return y === 0 ? 0 : x % y;
      case '<<': return x << y; case '>>': return x >> y; case '&': return x & y; case '|': return x | y; case '^': return x ^ y;
      case '<': return x < y ? 1 : 0; case '<=': return x <= y ? 1 : 0; case '>': return x > y ? 1 : 0; case '>=': return x >= y ? 1 : 0;
      case '==': return x === y ? 1 : 0; case '!=': return x !== y ? 1 : 0;
    }
    return 0;
  }
  function lookup(name) {
    if (name in vars) return vars[name];
    if (/^[.$@']/.test(name)) return 0;                               // unset script variable
    if (name === 'true') return 1;
    if (name === 'false') return 0;
    const p = ctx.param?.(name);
    if (p !== undefined) return p;
    if (name in ctx.constants) return ctx.constants[name];
    return name;                                                        // unresolved symbol: keep its name (RC_Demon, "SKILL")
  }
  function call(name, args) {
    const a = () => args.map(val);
    switch (name) {
      case 'getrefine': return num(ctx.refine?.() ?? 0);
      case 'getequiprefinerycnt': return num(ctx.refine?.(val(args[0])) ?? 0);
      case 'getenchantgrade': return num(ctx.grade?.(args.length ? val(args[0]) : undefined) ?? 0);
      case 'getskilllv': return num(ctx.skill?.(val(args[0])) ?? 0);
      case 'readparam': return num(ctx.readparam?.(args[0].k === 'var' ? args[0].name : val(args[0])) ?? 0);
      case 'getequipid': return num(ctx.equipId?.(val(args[0])) ?? -1);
      case 'getiteminfo': { const [id, t] = a(); return num(ctx.itemInfo?.(id, t) ?? -1); }
      case 'eaclass': return num(ctx.eaclass?.(args.length ? val(args[0]) : undefined) ?? 0);
      case 'getequipweaponlv': return num(ctx.weaponLevel?.(args.length ? val(args[0]) : undefined) ?? 0);
      case 'getequiparmorlv': return num(ctx.armorLevel?.(args.length ? val(args[0]) : undefined) ?? 0);
      case 'getitempos': return num(ctx.itemPos?.() ?? 0);
      case 'isequipped': case 'isequippedcnt': return ctx.isEquipped?.(a()) ? 1 : 0;
      case 'min': return Math.min(...a().map(num));
      case 'max': return Math.max(...a().map(num));
      case 'pow': { const [x, y] = a().map(num); return Math.trunc(x ** y); }
      case 'vip_status': return 0;
      case 'rand': { const v = a().map(num); return v.length > 1 ? v[0] : 0; }
      case 'gettime': return 0;
      case 'callfunc': out.ignored.push('callfunc ' + val(args[0])); return 0;
      default:
        if (!IGNORED_FUNCS.has(name)) out.ignored.push(name + '()');
        return 0;
    }
  }
  /**
   * autobonus "<script>",rate,duration{,flag}  (rate in 1/1000). The proc is listed in out.auto; its bonuses are added
   * only when ctx.autobonus is 'on' (always active) or a number 0..1 (expected uptime: numeric values are scaled).
   */
  function autobonus(name, args) {
    const [script, rate, duration, trigger] = args.map((x) => val(x));
    const entry = { kind: name, script: String(script), rate: num(rate), duration: num(duration), trigger: trigger ?? null };
    out.auto.push(entry);
    const mode = ctx.autobonus;
    if (mode !== 'on' && typeof mode !== 'number') return;
    const inner = run(compile(String(script).replace(/^\s*\{|\}\s*$/g, '')), { ...ctx, autobonus: undefined });
    const k = mode === 'on' ? 1 : Math.min(1, Math.max(0, mode));
    for (const b of inner.bonuses) {
      const scaled = b.slice();
      const last = scaled.length - 1;
      if (k !== 1 && typeof scaled[last] === 'number') scaled[last] = Math.trunc(scaled[last] * k);
      out.bonuses.push(scaled);
    }
  }
  function exec(s) {
    if (++steps > 20000) throw new Error('script too long');
    switch (s.k) {
      case 'block': for (const x of s.list) exec(x); return;
      case 'if': if (val(s.cond)) exec(s.then); else if (s.other) exec(s.other); return;
      case 'for': {
        if (s.init) val(s.init);
        let guard = 0;
        try { while ((s.cond ? val(s.cond) : 1) && guard++ < 1000) { exec(s.body); if (s.step) val(s.step); } }
        catch (e) { if (!(e instanceof Break)) throw e; }
        return;
      }
      case 'switch': {
        const v = val(s.value);
        let on = false;
        try {
          for (const c of s.cases) {
            if (!on && (c.test === null || val(c.test) === v)) on = true;
            if (on) for (const b of c.body) { if (b.k === 'break') throw new Break(); exec(b); }
          }
        } catch (e) { if (!(e instanceof Break)) throw e; }
        return;
      }
      case 'break': throw new Break();
      case 'end': throw new Stop();
      case 'expr': val(s.e); return;
      case 'cmd':
        if (BONUS_CMD.test(s.name)) {          // keep the bonus name (bStr, bAddRace...) as text
          out.bonuses.push(s.args.map((x, n) => (n === 0 && x.k === 'var' ? x.name : val(x))));
          return;
        }
        if (/^autobonus[23]?$/.test(s.name)) { autobonus(s.name, s.args); return; }
        if (s.name === 'skill') {               // skill "ASC_EDP",5; -> the equipment lets you use the skill
          const [sk, lv] = s.args.map((x) => val(x));
          out.grants.push([String(sk), num(lv) || 1]);
          return;
        }
        if (IGNORED_FUNCS.has(s.name)) { out.ignored.push(s.name); return; }
        call(s.name, s.args); return;
    }
  }
  try { exec(prog.ast); }
  catch (e) {
    if (!(e instanceof Stop) && !(e instanceof Break)) out.ignored.push('runtime error: ' + (e.message || e));
  }
  return out;
}
