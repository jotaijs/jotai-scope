import chalk from 'chalk'

type DiffFn = {
  (str: string): string
  previous: string | null
}

export function createDiffer(): DiffFn {
  function diffLine(prevLine: string, currLine: string): string {
    const prevWords = prevLine.split(/(\s+)/)
    const currWords = currLine.split(/(\s+)/)

    const lcs = computeLcs(prevWords, currWords)
    const result: string[] = []

    let prevIdx = 0
    let currIdx = 0
    let lcsIdx = 0

    while (prevIdx < prevWords.length || currIdx < currWords.length) {
      if (lcsIdx < lcs.length && prevWords[prevIdx] === lcs[lcsIdx] && currWords[currIdx] === lcs[lcsIdx]) {
        result.push(currWords[currIdx])
        prevIdx++
        currIdx++
        lcsIdx++
      } else if (currIdx < currWords.length && (lcsIdx >= lcs.length || currWords[currIdx] !== lcs[lcsIdx])) {
        if (prevIdx < prevWords.length && (lcsIdx >= lcs.length || prevWords[prevIdx] !== lcs[lcsIdx])) {
          result.push(chalk.strikethrough.dim.red(prevWords[prevIdx]))
          result.push(chalk.bold.green(currWords[currIdx]))
          prevIdx++
          currIdx++
        } else {
          result.push(chalk.bold.green(currWords[currIdx]))
          currIdx++
        }
      } else if (prevIdx < prevWords.length) {
        result.push(chalk.strikethrough.dim.red(prevWords[prevIdx]))
        prevIdx++
      }
    }

    return result.join('')
  }

  function computeLcs(a: string[], b: string[]): string[] {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }

    const result: string[] = []
    let i = m
    let j = n
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1])
        i--
        j--
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--
      } else {
        j--
      }
    }

    return result
  }

  function diffLines(prevLines: string[], currLines: string[]): string[] {
    const lcs = computeLcs(prevLines, currLines)
    const result: string[] = []

    let prevIdx = 0
    let currIdx = 0
    let lcsIdx = 0

    while (prevIdx < prevLines.length || currIdx < currLines.length) {
      if (lcsIdx < lcs.length && prevLines[prevIdx] === lcs[lcsIdx] && currLines[currIdx] === lcs[lcsIdx]) {
        // Line unchanged
        result.push(currLines[currIdx])
        prevIdx++
        currIdx++
        lcsIdx++
      } else if (currIdx < currLines.length && (lcsIdx >= lcs.length || currLines[currIdx] !== lcs[lcsIdx])) {
        if (prevIdx < prevLines.length && (lcsIdx >= lcs.length || prevLines[prevIdx] !== lcs[lcsIdx])) {
          // Line modified - do word-level diff
          result.push(diffLine(prevLines[prevIdx], currLines[currIdx]))
          prevIdx++
          currIdx++
        } else {
          // Line added
          result.push(chalk.bold.green(currLines[currIdx]))
          currIdx++
        }
      } else if (prevIdx < prevLines.length) {
        // Line removed
        result.push(chalk.strikethrough.dim.red(prevLines[prevIdx]))
        prevIdx++
      }
    }

    return result
  }

  const diff: DiffFn = function (str: string): string {
    if (diff.previous === null) {
      diff.previous = str
      return str
    }

    const prevLines = diff.previous.split('\n')
    const currLines = str.split('\n')
    const result = diffLines(prevLines, currLines)

    diff.previous = str
    return result.join('\n')
  }

  diff.previous = null

  return diff
}
