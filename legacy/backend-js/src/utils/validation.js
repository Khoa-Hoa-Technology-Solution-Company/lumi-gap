export function normalizeText(value) {
  return String(value).normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function validateFullName(value) {
  const fullName = normalizeText(value);
  const words = fullName.split(' ').filter(Boolean);

  if (fullName.length < 4 || words.length < 2 || !/\p{L}/u.test(fullName)) {
    return 'Please enter your full name';
  }

  if (!/^[\p{L}\s.'-]+$/u.test(fullName)) {
    return 'Full name contains invalid characters';
  }

  return '';
}

export function validateUniversity(value) {
  const university = normalizeText(value);
  const words = university.split(' ').filter(Boolean);
  const isKnownSingleWordName = /^(fpt|hutech|rmit|vinuni)$/i.test(university);

  if ((!isKnownSingleWordName && university.length < 5) || !/\p{L}/u.test(university)) {
    return 'Please enter a valid university name';
  }

  if (!/^[\p{L}\p{N}\s.'&(),-]+$/u.test(university)) {
    return 'University name contains invalid characters';
  }

  if (words.length < 2 && !isKnownSingleWordName) {
    return 'Please enter the full university name';
  }

  return '';
}
