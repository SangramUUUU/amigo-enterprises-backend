const ones = [
  '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];
const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function twoDigits(n) {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`.trim();
}

function threeDigits(n) {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  return `${ones[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`.trim();
}

function amountInWords(amount) {
  const num = Math.round(Number(amount) * 100) / 100;
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'ZERO RUPEES ONLY';

  const parts = [];
  let n = rupees;

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore) parts.push(`${twoDigits(crore)} CRORE`);
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (hundred) parts.push(threeDigits(hundred));

  let words = parts.join(' ').trim() || 'ZERO';
  words += rupees === 1 ? ' RUPEE' : ' RUPEES';

  if (paise > 0) {
    words += ` AND ${twoDigits(paise)} PAISE`;
  }

  return `${words} ONLY`;
}

module.exports = { amountInWords };
