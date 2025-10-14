export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  // Haversine formula
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

export function checkNearbyFriends(
  myLocation: { latitude: number; longitude: number },
  friendLocations: Map<string, any>,
  radiusMeters: number = 500
): string[] {
  const nearby: string[] = [];

  friendLocations.forEach((location, friendId) => {
    const distance = calculateDistance(
      myLocation.latitude,
      myLocation.longitude,
      location.latitude,
      location.longitude
    );

    if (distance <= radiusMeters) {
      nearby.push(friendId);
    }
  });

  return nearby;
}