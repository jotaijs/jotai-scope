export type MapAction<K, V> =
  | {
      type: 'SET'
      payload: {
        key: K
        value: V
      }
      value?: V | undefined
    }
  | {
      type: 'DELETE'
      payload: {
        key: K
        value?: undefined
      }
      value?: V | undefined
    }
  | {
      type: 'CLEAR'
      payload?: {
        key?: undefined
        value?: undefined
      }
      value?: undefined
    }

export class MapProxy<K, V> extends Map<K, V> {
  constructor(
    entries?: IterableIterator<[K, V]> | null,
    private callback?: (action: MapAction<K, V>) => void
  ) {
    super(entries)
  }

  set(key: K, value: V) {
    this.callback?.({
      type: 'SET',
      payload: { key, value },
      value: super.get(key),
    })
    return super.set(key, value)
  }

  delete(key: K) {
    this.callback?.({ type: 'DELETE', payload: { key }, value: super.get(key) })
    return super.delete(key)
  }

  clear() {
    this.callback?.({ type: 'CLEAR' })
    super.clear()
  }
}
