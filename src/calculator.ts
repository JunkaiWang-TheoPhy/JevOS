/** A small local arithmetic grammar; expressions never execute JavaScript. */
export function calculate(expression: string): number {
  if (!expression.trim() || expression.length > 160) throw new Error('输入一个算式，例如 24 × 7。');
  const source = expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g) || [];
  if (tokens.join('') !== source.replace(/\s/g, '')) throw new Error('只支持数字、括号和四则运算。');
  let index = 0;
  function atom(): number {
    const token = tokens[index++];
    if (token === '-') return -atom();
    if (token === '+') return atom();
    if (token === '(') {
      const value = sum();
      if (tokens[index++] !== ')') throw new Error('括号还没有配对。');
      return value;
    }
    if (token === undefined || !/^\d|^\.\d/.test(token)) throw new Error('算式还没有写完整。');
    return Number(token);
  }
  function product(): number {
    let value = atom();
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++];
      const right = atom();
      if (operator === '/' && right === 0) throw new Error('不能除以零。');
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++];
      const right = product();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('请检查算式。');
  return Number(result.toPrecision(12));
}
