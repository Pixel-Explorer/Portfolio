// levenshtein.js – ES module utility
// Returns the Levenshtein edit distance between two strings.
// Simple implementation without external dependencies.
export function distance(a = '', b = '') {
  const al = a.length;
  const bl = b.length;
  // quick checks
  if (al === 0) return bl;
  if (bl === 0) return al;
  // create matrix (al+1) x (bl+1)
  const matrix = new Array(al + 1);
  for (let i = 0; i <= al; i++) {
    matrix[i] = new Array(bl + 1);
    matrix[i][0] = i;
  }
  for (let j = 0; j <= bl; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= al; i++) {
    const ca = a.charAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cb = b.charAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      const deletion = matrix[i - 1][j] + 1;
      const insertion = matrix[i][j - 1] + 1;
      const substitution = matrix[i - 1][j - 1] + cost;
      matrix[i][j] = Math.min(deletion, insertion, substitution);
    }
  }
  return matrix[al][bl];
}
