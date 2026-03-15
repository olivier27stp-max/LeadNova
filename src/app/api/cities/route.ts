import { NextRequest, NextResponse } from "next/server";
import { getCitiesForZone, getProvinces, generateSearchUrl } from "@/lib/cities";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const province = searchParams.get("province") || undefined;
  const keyword = searchParams.get("keyword") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

  if (searchParams.get("list") === "provinces") {
    return NextResponse.json({ provinces: getProvinces() });
  }

  const cities = getCitiesForZone({ province, limit });

  const result = cities.map((c) => ({
    name: c.name,
    province: c.province,
    population: c.population,
    searchUrl: keyword ? generateSearchUrl(keyword, c.name, c.province) : undefined,
  }));

  return NextResponse.json({ cities: result, total: result.length });
}
