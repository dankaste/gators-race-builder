/**
 * Age-on-race-day computation.
 *
 * PlayMetrics exports birth dates as US-format strings (e.g. "4/26/2021").
 * Race categories key off the rider's integer age on the day of the race.
 */

/** Parse a US-format ("M/D/YYYY") or ISO ("YYYY-MM-DD") date into a UTC Date, or null. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();

  // ISO: YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Date.UTC(+y, +m - 1, +d));
  }

  // US: M/D/YYYY (also accepts 2-digit year)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(trimmed);
  if (us) {
    const [, m, d, yRaw] = us;
    const y = yRaw.length === 2 ? 2000 + +yRaw : +yRaw;
    return new Date(Date.UTC(y, +m - 1, +d));
  }

  return null;
}

/**
 * Integer age (completed years) the rider will be on race day.
 * Returns null if either date is unparseable.
 */
export function ageOnRaceDay(
  birthDate: string | null | undefined,
  raceDate: string | Date | null | undefined,
): number | null {
  const birth = parseDate(typeof birthDate === "string" ? birthDate : null);
  const race =
    raceDate instanceof Date
      ? raceDate
      : parseDate(typeof raceDate === "string" ? raceDate : null);
  if (!birth || !race) return null;

  let age = race.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    race.getUTCMonth() < birth.getUTCMonth() ||
    (race.getUTCMonth() === birth.getUTCMonth() &&
      race.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
