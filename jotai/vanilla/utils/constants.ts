import { MODE } from '../../mode'

export const RESET = Symbol(
  MODE !== 'production' ? 'RESET' : '',
)
