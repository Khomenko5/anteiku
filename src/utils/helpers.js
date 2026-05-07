export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const formatPoints = (points) => {
  if (points < 0) return 0;
  return Math.floor(points);
};