export function checkSlotConflict(
  requestedSlot: string,
  availbaleSlots: string[],
) {
  //checking if slot is unavailable
  if (!availbaleSlots.includes(requestedSlot)) {
    return {
      conflict: true,
      message: "Requested slot unavailable",
      alternatives: availbaleSlots.slice(0, 3),
    };
  }
  return {
    conflict: false,
  };
}
