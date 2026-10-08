export const MAPS_COUNTRIES = { US: 'United States', CA: 'Canada' };

export function resolveMapsCountry(value) {
  const normalized = String(value ?? 'US').trim().toUpperCase();
  if (['US', 'USA', 'UNITED STATES'].includes(normalized)) return 'US';
  if (['CA', 'CAN', 'CANADA'].includes(normalized)) return 'CA';
  const error = new Error('Choose United States or Canada as the search country.');
  error.statusCode = 400;
  throw error;
}

export function mapsSearchLocation(value, country) {
  const location = String(value || '').trim();
  const name = MAPS_COUNTRIES[country];
  if (!location) return name;
  const hasCountry = country === 'CA' ? /\bCanada\s*$/i.test(location)
    : /(?:\bUnited States(?: of America)?|\bUSA|\bUS)\s*$/i.test(location);
  return hasCountry ? location : `${location}, ${name}`;
}

// US and Canadian national numbers both normalize to the +1 numbering plan.
// Country filtering is based on the business address, not its phone prefix.
export function normalizeMapsPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function isMapsPlaceInCountry(place, selectedCountry) {
  const component = place?.addressComponents?.find(item => item.types?.includes('country'));
  if (component?.shortText) return component.shortText.toUpperCase() === selectedCountry;
  const address = String(place?.formattedAddress || '');
  return selectedCountry === 'CA' ? /\bCanada\s*$/i.test(address)
    : /(?:\bUSA|\bUnited States(?: of America)?)\s*$/i.test(address);
}
