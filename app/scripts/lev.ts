
// https://en.wikipedia.org/wiki/Wagner%E2%80%93Fischer_algorithm
export function ld(a: string, b: string) {
  const v_a = a.trim();
  const v_b = b.trim();

  const l_a = v_a.length;
  const l_b = v_b.length;

  if (l_a === 0) {
    return l_b;
  }

  if (l_b === 0) {
    return l_a;
  }

  const arr_a: Array<string> = v_a.padStart(l_a + 1, '#').split("");
  const arr_b: Array<string> = v_b.padStart(l_b + 1, '#').split("");

  const matrix: Array<Array<number>> = [];

  for (let i = 0; i <= l_b; i++) {
    matrix[i] = [];

    for (let j = 0; j <= l_a; j++) {
      if (i === 0) {
        matrix[i][j] = j;
      } else if (j === 0) {
        matrix[i][j] = i;
      } else {
        matrix[i][j] = NaN;
      }
    }
  }

  for (let i = 1; i <= l_b; i++) {
    for (let j = 1; j <= l_a; j++) {
      let cost = 1;
      if (arr_b[i] === arr_a[j]) {
        cost = 0;
      }

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // insert
        matrix[i][j - 1] + 1, // remove
        matrix[i - 1][j - 1] + cost // replace
      );
    }
  }

  // console.table(matrix);
  return matrix[l_b][l_a];
}
