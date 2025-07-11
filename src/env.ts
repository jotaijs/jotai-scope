export const __DEV__ =
  typeof import.meta !== 'undefined' &&
  import.meta.env !== undefined &&
  import.meta.env.MODE === 'development'
    ? true
    : process.env.NODE_ENV !== 'production'
