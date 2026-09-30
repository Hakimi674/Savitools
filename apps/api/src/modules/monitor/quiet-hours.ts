/**
 * Timezone and quiet-hours evaluation helpers.
 *
 * All conversions use Node.js's native `Intl.DateTimeFormat`, which reads the
 * system IANA time zone database. This guarantees explicit and accurate DST
 * handling across transitions (e.g. spring forward 01:59 -> 03:00 and fall back
 * 01:59 -> 01:00) without arbitrary UTC offset approximations.
 */

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Parses an "HH:mm" string into minutes since midnight [0, 1439]. */
export function parseTimeMinutes(timeStr: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  if (!match) {
    throw new Error(`Invalid time format "${timeStr}", expected "HH:mm" in 24-hour format`);
  }
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

/**
 * Returns the local hour and minute (as minutes since midnight) for a given
 * UTC Date in the target IANA timezone.
 */
export function getLocalMinutesInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  let hours = 0;
  let minutes = 0;
  for (const part of parts) {
    if (part.type === 'hour') {
      hours = parseInt(part.value, 10);
      if (hours === 24) hours = 0;
    } else if (part.type === 'minute') {
      minutes = parseInt(part.value, 10);
    }
  }

  return hours * 60 + minutes;
}

/**
 * Checks whether `date` falls inside the quiet-hours window in `timezone`.
 *
 * Supports both daytime quiet hours (e.g. 13:00 to 15:00) and overnight quiet
 * hours spanning midnight (e.g. 22:00 to 08:00).
 */
export function isWithinQuietHours(
  date: Date,
  timezone: string,
  start: string,
  end: string,
): boolean {
  if (!isValidTimezone(timezone)) {
    timezone = 'UTC';
  }

  const startMin = parseTimeMinutes(start);
  const endMin = parseTimeMinutes(end);

  if (startMin === endMin) {
    return false;
  }

  const currentMin = getLocalMinutesInTimezone(date, timezone);

  if (startMin < endMin) {
    // Normal window within the same calendar day (e.g. 13:00 to 15:00)
    return currentMin >= startMin && currentMin < endMin;
  }

  // Overnight window spanning midnight (e.g. 22:00 to 08:00)
  return currentMin >= startMin || currentMin < endMin;
}
