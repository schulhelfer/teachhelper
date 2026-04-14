export function resolveRandomPickerDom(doc = document) {
  return {
    host: doc.getElementById('random-picker-host'),
    wheel: doc.getElementById('random-picker-wheel'),
    cards: doc.querySelectorAll('[data-random-slot]'),
    importButton: doc.getElementById('random-picker-import'),
    exportButton: doc.getElementById('random-picker-export'),
    startButton: doc.getElementById('random-picker-start'),
    startButtons: doc.querySelectorAll('[data-random-picker-start]'),
  };
}

export function mountRandomPicker() {
  return {
    render() {},
    setActive() {},
  };
}
