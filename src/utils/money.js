function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatMoney(value) {
  return round2(value).toFixed(2);
}

module.exports = { round2, formatMoney };
