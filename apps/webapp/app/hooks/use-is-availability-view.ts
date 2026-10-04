/**
 * Fork: the availability (calendar) view of the assets and boxes lists is
 * switched off everywhere, so this always says no. A `?view=availability` left
 * in an old link is ignored.
 */
export function useIsAvailabilityView() {
  return {
    isAvailabilityView: false as boolean,
    shouldShowAvailabilityView: false as boolean,
  };
}
