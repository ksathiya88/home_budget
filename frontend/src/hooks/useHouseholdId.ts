import { useMemo } from "react";

// Placeholder hook to surface household context for requests.
export const useHouseholdId = () => {
  return useMemo(() => {
    // TODO: connect to Firebase Auth / user profile
    return "demo-household";
  }, []);
};
