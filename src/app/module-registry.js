export function createModuleRegistry(adapters) {
  const modules = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  let disposed = false;
  return Object.freeze({
    get: (id) => modules.get(id) || null,
    list: () => [...modules.values()],
    broadcast(payload, predicate = () => true) {
      if (disposed) return;
      modules.forEach((adapter) => {
        if (predicate(adapter)) adapter.postMessage(payload);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      modules.forEach((adapter) => {
        try {
          adapter.dispose();
        } catch (error) {
          errors.push(error);
        }
      });
      if (errors.length) throw new AggregateError(errors, 'Module konnten nicht vollständig beendet werden.');
    },
  });
}
