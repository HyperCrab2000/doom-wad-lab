/** Browser shim for Node's util.inherits (opl3 depends on it). */
export function inherits(
  ctor: new (...args: unknown[]) => unknown,
  superCtor: new (...args: unknown[]) => unknown
): void {
  if (!superCtor) return;
  (ctor as { super_?: unknown }).super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
}

export default { inherits };
