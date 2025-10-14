export class LocationOptimiser {
  private lastUpdate: Date | null = null;
  private lastLocation: { lat: number; lng: number } | null = null;
  private minTimeMs: number;
  private minDistanceMeters: number;

  constructor(minTimeMs = 300000, minDistanceMeters = 100) {
    // Default: 5 minutes or 100 meters
    this.minTimeMs = minTimeMs;
    this.minDistanceMeters = minDistanceMeters;
  }

  shouldUpdate(lat: number, lng: number): boolean {
    const now = new Date();

    // Always update if first time
    if (!this.lastUpdate || !this.lastLocation) {
      this.lastUpdate = now;
      this.lastLocation = { lat, lng };
      return true;
    }

    // Check time elapsed
    const timeElapsed = now.getTime() - this.lastUpdate.getTime();
    if (timeElapsed < this.minTimeMs) {
      // Check distance moved
      const distance = this.calculateDistance(
        this.lastLocation.lat,
        this.lastLocation.lng,
        lat,
        lng
      );

      if (distance < this.minDistanceMeters) {
        return false; // Don't update
      }
    }

    // Update if time elapsed OR moved far enough
    this.lastUpdate = now;
    this.lastLocation = { lat, lng };
    return true;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}