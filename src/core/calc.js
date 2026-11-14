import { badRequest } from './errors.js';

/**
 * Evaluador de expresiones matematicas.
 * Tokenizador + Shunting Yard: no usa eval() ni Function(), asi que la entrada
 * del usuario nunca se ejecuta como codigo.
 *
 * Soporta: + - * / % ^ ( ), numeros con decimales y notacion cientifica,
 * constantes pi/e y las funciones listadas en FUNCTIONS.
 */

const FUNCTIONS = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  log: Math.log10,
  ln: Math.log,
  log2: Math.log2,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  random: Math.random,
};

const CONSTANTS = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const OPERATORS = {
  '+': { prec: 1, assoc: 'L', arity: 2, fn: (a, b) => a + b },
  '-': { prec: 1, assoc: 'L', arity: 2, fn: (a, b) => a - b },
  '*': { prec: 2, assoc: 'L', arity: 2, fn: (a, b) => a * b },
  '/': { prec: 2, assoc: 'L', arity: 2, fn: (a, b) => a / b },
  '%': { prec: 2, assoc: 'L', arity: 2, fn: (a, b) => a % b },
  '^': { prec: 3, assoc: 'R', arity: 2, fn: (a, b) => a ** b },
  u: { prec: 4, assoc: 'R', arity: 1, fn: (a) => -a },
};

function tokenize(input) {
  const src = String(input).replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').trim();
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const char = src[i];
    if (char === ' ') {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!match) throw badRequest('Numero con formato invalido.');
      tokens.push({ type: 'number', value: Number.parseFloat(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[a-zπ]/i.test(char)) {
      const match = /^[a-zπ]+/i.exec(src.slice(i));
      const word = match[0].toLowerCase();
      const isFn = src[i + word.length] === '(';
      tokens.push({ type: isFn ? 'function' : 'const', value: word });
      i += word.length;
      continue;
    }
    if ('+-*/%^()'.includes(char)) {
      tokens.push({ type: 'op', value: char });
      i += 1;
      continue;
    }
    throw badRequest(`Caracter no permitido: "${char}".`);
  }
  return tokens;
}

/** Convierte a notacion polaca inversa, resolviendo signos unarios e implicitos. */
function toRpn(tokens) {
  const output = [];
  const stack = [];
  let prev = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'number') {
      output.push(token);
    } else if (token.type === 'const') {
      if (!(token.value in CONSTANTS)) throw badRequest(`Constante desconocida: "${token.value}".`);
      output.push({ type: 'number', value: CONSTANTS[token.value] });
    } else if (token.type === 'function') {
      if (!(token.value in FUNCTIONS)) throw badRequest(`Funcion desconocida: "${token.value}".`);
      stack.push(token);
    } else if (token.value === '(') {
      // Multiplicacion implicita: 2(3+4) o )( no, solo numero/constante antes de (
      if (prev && (prev.type === 'number' || (prev.type === 'op' && prev.value === ')'))) {
        stack.push({ type: 'op', value: '*' });
      }
      stack.push(token);
    } else if (token.value === ')') {
      while (stack.length && stack[stack.length - 1].value !== '(') output.push(stack.pop());
      if (!stack.length) throw badRequest('Parentesis sin cerrar.');
      stack.pop();
      if (stack.length && stack[stack.length - 1].type === 'function') output.push(stack.pop());
    } else {
      let op = token.value;
      // Signo unario: al inicio, tras un operador o tras "("
      const unary =
        (op === '-' || op === '+') &&
        (!prev || (prev.type === 'op' && prev.value !== ')'));
      if (unary) {
        if (op === '+') {
          prev = token;
          continue; // +x es x
        }
        op = 'u';
      }
      const current = OPERATORS[op];
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.value === '(') break;
        const topOp = OPERATORS[top.value];
        if (!topOp) break;
        const takesPrecedence =
          topOp.prec > current.prec || (topOp.prec === current.prec && current.assoc === 'L');
        if (!takesPrecedence) break;
        output.push(stack.pop());
      }
      stack.push({ type: 'op', value: op });
    }
    prev = token;
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.value === '(' || top.value === ')') throw badRequest('Parentesis sin balancear.');
    output.push(top);
  }
  return output;
}

function evalRpn(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }
    if (token.type === 'function') {
      const fn = FUNCTIONS[token.value];
      const arity = fn.length || 1;
      const args = stack.splice(stack.length - arity, arity);
      if (args.length !== arity) throw badRequest(`A "${token.value}" le faltan argumentos.`);
      stack.push(fn(...args));
      continue;
    }
    const op = OPERATORS[token.value];
    if (!op) throw badRequest(`Operador no soportado: "${token.value}".`);
    const args = stack.splice(stack.length - op.arity, op.arity);
    if (args.length !== op.arity) throw badRequest('Expresion incompleta.');
    stack.push(op.fn(...args));
  }
  if (stack.length !== 1) throw badRequest('Expresion incompleta o mal formada.');
  return stack[0];
}

/**
 * Evalua una expresion y devuelve un objeto descriptivo.
 * @param {string} expression
 */
export function evaluate(expression) {
  if (!expression || !String(expression).trim()) throw badRequest('La expresion esta vacia.');
  const tokens = tokenize(expression);
  if (!tokens.length) throw badRequest('La expresion esta vacia.');
  const result = evalRpn(toRpn(tokens));

  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw badRequest('La expresion no produce un numero real.');
  }
  const rounded = Math.abs(result) < 1e-12 ? 0 : Number(result.toPrecision(14));
  return {
    expression: String(expression).trim(),
    result: rounded,
    formatted: new Intl.NumberFormat('es-ES', { maximumFractionDigits: 14 }).format(rounded),
    isInteger: Number.isInteger(rounded),
  };
}

export const SUPPORTED_FUNCTIONS = Object.keys(FUNCTIONS);
export const SUPPORTED_CONSTANTS = Object.keys(CONSTANTS);
