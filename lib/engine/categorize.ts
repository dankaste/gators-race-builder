import type { CategoryDef, Gender } from "./models";

/** Does a rider's age satisfy a category's age predicate? */
function ageMatches(age: number, cat: CategoryDef): boolean {
  if (cat.ages && cat.ages.length > 0) return cat.ages.includes(age);
  const okMin = cat.ageMin === undefined || age >= cat.ageMin;
  const okMax = cat.ageMax === undefined || age <= cat.ageMax;
  return okMin && okMax;
}

/** Does a rider's PlayMetrics package satisfy a category's package predicate? */
function packageMatches(packageName: string, cat: CategoryDef): boolean {
  if (!cat.packages || cat.packages.length === 0) return true;
  const p = packageName.toLowerCase();
  return cat.packages.some((needle) => p.includes(needle.toLowerCase()));
}

/**
 * Find the first category (in config order) a rider belongs to, or null.
 * Categories are ordered, so the first match wins — author them most-specific
 * first when predicates overlap.
 */
export function matchCategory(
  rider: { gender: Gender | string; ageOnRaceDay: number | null; packageName: string },
  categories: CategoryDef[],
): CategoryDef | null {
  const { gender, ageOnRaceDay: age, packageName } = rider;
  if (age === null) return null;
  for (const cat of categories) {
    if (
      cat.genders.includes(gender as Gender) &&
      ageMatches(age, cat) &&
      packageMatches(packageName, cat)
    ) {
      return cat;
    }
  }
  return null;
}
