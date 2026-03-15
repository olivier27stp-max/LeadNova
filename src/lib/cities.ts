import citiesData from "./data/cities-canada.json";

export interface CityEntry {
  name: string;
  province: string;
  population: number;
}

const PROVINCE_NAMES: Record<string, string> = {
  QC: "Québec",
  ON: "Ontario",
  BC: "Colombie-Britannique",
  AB: "Alberta",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NB: "Nouveau-Brunswick",
  NS: "Nouvelle-Écosse",
  PE: "Île-du-Prince-Édouard",
  NL: "Terre-Neuve-et-Labrador",
  NT: "Territoires du Nord-Ouest",
  YT: "Yukon",
  NU: "Nunavut",
};

/**
 * Get all available provinces from the city data
 */
export function getProvinces(): { code: string; name: string }[] {
  const codes = [...new Set((citiesData as CityEntry[]).map((c) => c.province))];
  return codes
    .map((code) => ({ code, name: PROVINCE_NAMES[code] || code }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Get cities for a geographic zone, sorted by population (largest first)
 */
export function getCitiesForZone(options: {
  country?: string;
  province?: string;
  region?: string;
  limit?: number;
}): CityEntry[] {
  let cities = citiesData as CityEntry[];

  // Filter by province
  if (options.province) {
    cities = cities.filter(
      (c) => c.province.toLowerCase() === options.province!.toLowerCase()
    );
  }

  // Sort by population descending (largest first)
  cities = cities.sort((a, b) => b.population - a.population);

  // Apply limit
  if (options.limit && options.limit > 0) {
    cities = cities.slice(0, options.limit);
  }

  return cities;
}

/**
 * Generate a Google Maps search URL for a keyword in a city
 */
export function generateSearchUrl(keyword: string, cityName: string, province?: string): string {
  const location = province
    ? `${cityName}, ${province}`
    : cityName;
  const query = `${keyword} in ${location}`;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

/**
 * Get province full name from code
 */
export function getProvinceName(code: string): string {
  return PROVINCE_NAMES[code.toUpperCase()] || code;
}
