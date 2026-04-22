export function calculateFare(distanceMeters, rates) {
  const km = distanceMeters / 1000;
  return Math.round(rates.base + km * rates.perKm);
}