import dayjs from 'dayjs';

export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString) => {
  if (!dateString) return "";

  // Backend-parsed dates arrive as ISO (e.g. "2020-09-06T00:00:00Z").
  // Slice the date part directly to avoid timezone-induced off-by-one days.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}`;
  }

  // Try parsing with DayJS for MM/DD/YY format
  const dateFormats = ['MM/DD/YY', 'MM/DD/YYYY', 'M/D/YY', 'M/D/YYYY'];
  
  for (const format of dateFormats) {
    const parsedDate = dayjs(dateString, format, true);
    if (parsedDate.isValid()) {
      return parsedDate.format('MM/DD');
    }
  }
  
  // If DayJS parsing fails, try native Date parsing
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return dayjs(date).format('MM/DD');
  }
  
  return dateString; // Return original if parsing fails
};
