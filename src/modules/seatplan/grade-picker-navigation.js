export const COURSE_GRADE_NEIGHBOR_OFFSETS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

function getSeatCoordinates(seatId) {
  const [row, column] = String(seatId || '').split('-').map(Number);
  return Number.isInteger(row) && Number.isInteger(column) && row >= 1 && column >= 1
    ? { row, column }
    : null;
}

function createSeatId(row, column) {
  return `${row}-${column}`;
}

export function findNextCourseGradeSeat({
  currentSeatId = '',
  seatIds = [],
  visitedSeatIds = new Set(),
} = {}) {
  const orderedSeatIds = Array.from(new Set(
    (Array.isArray(seatIds) ? seatIds : [])
      .map(seatId => String(seatId || ''))
      .filter(Boolean)
  ));
  if (!orderedSeatIds.length) return null;

  const availableSeatIds = new Set(orderedSeatIds);
  const visited = visitedSeatIds instanceof Set ? visitedSeatIds : new Set(visitedSeatIds || []);
  const current = String(currentSeatId || '');

  if (availableSeatIds.has(current)) {
    const checkedSeatIds = new Set([current]);
    const seatsToCheck = [current];
    while (seatsToCheck.length) {
      const seatIdToCheck = seatsToCheck.shift();
      const coordinates = getSeatCoordinates(seatIdToCheck);
      if (!coordinates) continue;
      for (const [rowOffset, columnOffset] of COURSE_GRADE_NEIGHBOR_OFFSETS) {
        const neighborSeatId = createSeatId(coordinates.row + rowOffset, coordinates.column + columnOffset);
        if (!availableSeatIds.has(neighborSeatId) || checkedSeatIds.has(neighborSeatId)) continue;
        checkedSeatIds.add(neighborSeatId);
        seatsToCheck.push(neighborSeatId);
        if (!visited.has(neighborSeatId)) {
          return { seatId: neighborSeatId, completedPass: false };
        }
      }
    }
  }

  const nextUnvisitedSeatId = orderedSeatIds.find(seatId => !visited.has(seatId));
  if (nextUnvisitedSeatId) {
    return { seatId: nextUnvisitedSeatId, completedPass: false };
  }

  const fallbackIndex = Math.max(0, orderedSeatIds.indexOf(current));
  return {
    seatId: orderedSeatIds[(fallbackIndex + 1) % orderedSeatIds.length],
    completedPass: true,
  };
}
