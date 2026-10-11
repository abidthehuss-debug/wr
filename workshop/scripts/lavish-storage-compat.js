// Lavish renders application artifacts in an opaque sandbox. Browsers expose
// Web Storage there but can throw a SecurityError as soon as it is accessed.
// Install a page-local fallback before the application starts. Working browser
// storage is preserved; real persistence is verified on the normal app origin.
(() => {
  const createMemoryStorage = () => {
    const values = new Map()
    const storagePrototype = typeof globalThis.Storage === 'function'
      ? globalThis.Storage.prototype
      : null
    const storage = Object.create(storagePrototype)

    Object.defineProperties(storage, {
      length: {
        enumerable: false,
        get: () => values.size,
      },
      clear: {
        enumerable: false,
        value: () => values.clear(),
      },
      getItem: {
        enumerable: false,
        value: (key) => {
          const normalizedKey = String(key)
          return values.has(normalizedKey) ? values.get(normalizedKey) : null
        },
      },
      key: {
        enumerable: false,
        value: (index) => {
          const normalizedIndex = Number(index)
          if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null
          return Array.from(values.keys())[normalizedIndex] ?? null
        },
      },
      removeItem: {
        enumerable: false,
        value: (key) => { values.delete(String(key)) },
      },
      setItem: {
        enumerable: false,
        value: (key, value) => { values.set(String(key), String(value)) },
      },
    })

    return new Proxy(storage, {
      deleteProperty: (target, property) => {
        if (typeof property === 'string' && !Reflect.has(target, property)) {
          values.delete(property)
          return true
        }
        return Reflect.deleteProperty(target, property)
      },
      get: (target, property, receiver) => {
        if (typeof property !== 'string' || Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver)
        }
        return values.get(property)
      },
      getOwnPropertyDescriptor: (target, property) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property)
        if (descriptor || typeof property !== 'string' || !values.has(property)) return descriptor
        return { configurable: true, enumerable: true, value: values.get(property), writable: true }
      },
      ownKeys: (target) => [
        ...Reflect.ownKeys(target),
        ...Array.from(values.keys()).filter((key) => !Reflect.has(target, key)),
      ],
      set: (target, property, value, receiver) => {
        if (typeof property !== 'string' || Reflect.has(target, property)) {
          return Reflect.set(target, property, value, receiver)
        }
        values.set(property, String(value))
        return true
      },
    })
  }

  for (const storageName of ['localStorage', 'sessionStorage']) {
    try {
      const storage = globalThis[storageName]
      const probeKey = '__lavish_storage_probe__' + Date.now() + '_' + Math.random()
      storage.setItem(probeKey, probeKey)
      storage.removeItem(probeKey)
      continue
    } catch {
      // Replace the sandbox-denied getter below.
    }

    try {
      Object.defineProperty(globalThis, storageName, {
        configurable: true,
        enumerable: true,
        value: createMemoryStorage(),
      })
    } catch (error) {
      console.error('[Lavish] Could not install the in-memory ' + storageName + ' fallback.', error)
    }
  }
})()
