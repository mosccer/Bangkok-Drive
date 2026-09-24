export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

// Compass heading for a yaw where forward = (sin(yaw), cos(yaw)) and north is -z.
export function headingDegrees(yaw: number): number {
  const degrees = (180 - (yaw * 180) / Math.PI) % 360;
  return degrees < 0 ? degrees + 360 : degrees;
}

export function bearingDegrees(dx: number, dz: number): number {
  return headingDegrees(Math.atan2(dx, dz));
}

export function relativeBearing(targetDegrees: number, headingDeg: number): number {
  let relative = targetDegrees - headingDeg;
  if (relative > 180) relative -= 360;
  if (relative < -180) relative += 360;
  return relative;
}

export function cardinalFor(degrees: number): string {
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return labels[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
