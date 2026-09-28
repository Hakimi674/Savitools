export const validateHexString = (str: string, length: number): boolean => {
  if (typeof str !== 'string') return false;
  if (str.length !== length * 2) return false;

  const hexRegex = new RegExp(`^[0-9a-fA-F]{{${length * 2}}}$`);
  return hexRegex.test(str);
};