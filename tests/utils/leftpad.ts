export function leftpad(str: string, pad: string = '  '): string {
  return str
    .split('\n')
    .map((line) => pad + line)
    .join('\n')
}
