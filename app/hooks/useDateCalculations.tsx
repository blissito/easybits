export const useDateCalculations = () => {
  const getDisplayTime = (date?: Date) => {
    const today = new Date(date as Date);
    return today
      .toLocaleDateString("es-MX", {
        hour: "numeric",
        minute: "numeric",
      })
      .split(",")[1];
  };
  const getDisplayDate = (date?: Date) => {
    const today = new Date(date as Date);
    return today.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  return {
    getDisplayTime,
    getDisplayDate,
  };
};
