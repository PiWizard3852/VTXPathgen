import type { Curve, Point } from '~/routes';

enum Tokens {
  NEW,
  FOLLOW_TRAJECTORIES,
  POINT,
  OPEN_PAREN,
  CLOSE_PAREN,
  COMMA,
  NUMERIC_LITERAL,
  UNKNOWN_IDENTIFIER,
}

function isAlpha(char: string): boolean {
  const code = char.charCodeAt(0);

  return (code > 64 && code < 91) || (code > 96 && code < 123);
}

function isNumeric(char: string): boolean {
  const code = char.charCodeAt(0);

  return code > 47 && code < 58;
}

function parsePoint(tokens: Tokens[], numericLiterals: number[]) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (i === 0 && token !== Tokens.NEW) {
      return null;
    }

    if (i === 1 && token !== Tokens.POINT) {
      return null;
    }

    if (i === 2 && token !== Tokens.OPEN_PAREN) {
      return null;
    }

    if (i === 3 && token !== Tokens.NUMERIC_LITERAL) {
      return null;
    }

    if (i === 4 && token !== Tokens.COMMA) {
      return null;
    }

    if (i === 5 && token !== Tokens.NUMERIC_LITERAL) {
      return null;
    }

    if (i === 6 && token !== Tokens.CLOSE_PAREN) {
      return null;
    }
  }

  return {
    x: numericLiterals.shift(),
    y: numericLiterals.shift(),
  };
}

function parseCurve(
  tokens: Tokens[],
  numericLiterals: number[],
): [Curve, Tokens[], number[]] | null {
  const curve = {
    color:
      '#' +
      [...Array(6)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join(''),
    points: [] as Point[],
  };

  if (tokens.length < 23) {
    return null;
  }

  let finalIndex = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (i === 0 && token !== Tokens.NEW) {
      return null;
    }

    if (i === 1 && token !== Tokens.FOLLOW_TRAJECTORIES) {
      return null;
    }

    if (i === 2 && token !== Tokens.OPEN_PAREN) {
      return null;
    }

    if (
      i === 3 &&
      token !== Tokens.NUMERIC_LITERAL &&
      token !== Tokens.UNKNOWN_IDENTIFIER
    ) {
      return null;
    }

    if (i === 3 && token === Tokens.NUMERIC_LITERAL) {
      numericLiterals.shift();
    }

    if (i === 4 && token !== Tokens.COMMA) {
      return null;
    }

    if (
      i === 5 &&
      token !== Tokens.NUMERIC_LITERAL &&
      token !== Tokens.UNKNOWN_IDENTIFIER
    ) {
      return null;
    }

    if (i === 5 && token === Tokens.NUMERIC_LITERAL) {
      numericLiterals.shift();
    }

    if (i === 6 && token !== Tokens.COMMA) {
      return null;
    }

    if (i > 6) {
      let end = false;

      while (!end) {
        if (i + 7 >= tokens.length) {
          return null;
        }

        const point = parsePoint(tokens.slice(i, i + 7), numericLiterals);

        if (point) {
          curve.points.push(point as Point);

          if (tokens[i + 7] !== Tokens.COMMA) {
            i += 7;
            end = true;
          } else {
            i += 8;
          }
        }
      }

      if (tokens[i] !== Tokens.CLOSE_PAREN) {
        return null;
      }

      finalIndex = i;
      break;
    }
  }

  if (curve.points.length < 2) {
    return null;
  }

  return [curve, tokens.slice(finalIndex + 1), numericLiterals];
}

export function parseCode(code: string): Curve[] | null {
  let tokens: Tokens[] = [];
  let numericLiterals: number[] = [];

  code = code.toLowerCase();

  for (let i = 0; i < code.length; i++) {
    const char = code.charAt(i);

    if (char === '\n' || char === '\t' || char === ' ') {
      continue;
    }

    if (char === ',') {
      tokens.push(Tokens.COMMA);
      continue;
    }

    if (char === '(') {
      tokens.push(Tokens.OPEN_PAREN);
      continue;
    }

    if (char === ')') {
      tokens.push(Tokens.CLOSE_PAREN);
      continue;
    }

    if (isAlpha(char)) {
      let token = char;

      while (isAlpha(code.charAt(i + 1)) || code.charAt(i + 1) === '_') {
        token += code.charAt(i + 1);

        i++;
      }

      if (token === 'new') {
        tokens.push(Tokens.NEW);
        continue;
      }

      if (token === 'followtrajectories') {
        tokens.push(Tokens.FOLLOW_TRAJECTORIES);
        continue;
      }

      if (token === 'point') {
        tokens.push(Tokens.POINT);
        continue;
      }

      tokens.push(Tokens.UNKNOWN_IDENTIFIER);
      continue;
    }

    if (isNumeric(char) || char === '-' || char === '.') {
      let token = char;

      while (isNumeric(code.charAt(i + 1)) || code.charAt(i + 1) === '.') {
        token += code.charAt(i + 1);

        i++;
      }

      numericLiterals.push(parseInt(token, 10));
      tokens.push(Tokens.NUMERIC_LITERAL);

      continue;
    }

    return null;
  }

  const curves: Curve[] = [];

  let finished = false;

  while (!finished) {
    const result = parseCurve(tokens, numericLiterals);

    if (!result) {
      finished = true;
      continue;
    }

    let curve;
    [curve, tokens, numericLiterals] = result;

    curves.push(curve);

    if (tokens.shift() !== Tokens.COMMA) {
      finished = true;
      continue;
    }

    tokens.forEach((token) => console.log(Tokens[token]));
  }

  return curves;
}
