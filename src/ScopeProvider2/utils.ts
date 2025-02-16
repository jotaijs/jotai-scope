/**
 * @returns true if the two sets are equal
 */
export function isEqualSet(a: Set<unknown>, b: Set<unknown>) {
  return a === b || (a.size === b.size && Array.from(a).every((v) => b.has(v)))
}

type MapLike<K, V> = {
  has?(key: K): boolean
  get(key: K): V | undefined
  set(key: K, value: V): void
}

type SetLike<T> = {
  has(value: T): boolean
  add(value: T): boolean
}

/**
 * emplace a key-value pair in a collection if the key is not already present
 * @param key - the key to emplace
 * @param map - the map to emplace the key-value pair
 * @param callback - the callback to create the value. It is only called if the key is not already present.
 * @returns the value associated with the key
 */
export function emplace<R, T extends R, U, V extends U>(
  key: T,
  map: MapLike<R, U> | SetLike<R>,
  callback: (key: T) => V
): V
export function emplace<R extends WeakKey, T extends R, U, V extends U>(
  key: T,
  map: WeakMap<R, U> | WeakSet<R>,
  callback: (key: T) => V
): V
export function emplace(
  key: any,
  collection: any,
  callback: (key: any) => any
) {
  if (collection.has ? !collection.has(key) : !collection.get(key)) {
    if (collection.add?.(key)) {
      callback(key)
    } else {
      collection.set(key, callback(key))
    }
  }
  return collection.get?.(key)
}
