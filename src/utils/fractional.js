// Fractional ordering keys: plain strings that sort lexicographically.
// Inserting between two existing keys always produces a new key strictly
// between them, so a reorder only ever rewrites the moved row's position.

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// Returns a key strictly between a and b. Empty string means unbounded
// (a = '' → below everything, b = '' → above everything). Generated keys
// never end with the smallest digit, which keeps "between" always possible.
export function positionBetween(a = '', b = '') {
  if (b && a >= b) throw new Error(`positionBetween: "${a}" >= "${b}"`)

  if (b) {
    // Recurse past the shared prefix (a shorter than b reads as trailing '0's)
    let n = 0
    while ((a[n] || DIGITS[0]) === b[n]) n++
    if (n > 0) return b.slice(0, n) + positionBetween(a.slice(n), b.slice(n))
  }

  const digitA = a ? DIGITS.indexOf(a[0]) : 0
  const digitB = b ? DIGITS.indexOf(b[0]) : DIGITS.length

  if (digitB - digitA > 1) {
    // Room between the digits — take the midpoint
    return DIGITS[Math.floor((digitA + digitB) / 2)]
  }
  if (b && b.length > 1) {
    // Adjacent digits but b continues, so b's first digit alone is between
    return b.slice(0, 1)
  }
  // Adjacent digits and no room below b: keep a's digit and go between
  // the rest of a and +infinity
  return DIGITS[digitA] + positionBetween(a.slice(1), '')
}

// Keys for n items in list order (bulk conversion on migration/import)
export function seqPositions(n) {
  const keys = []
  let prev = ''
  for (let i = 0; i < n; i++) {
    prev = positionBetween(prev, '')
    keys.push(prev)
  }
  return keys
}
