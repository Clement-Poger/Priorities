export function useHaptics() {
  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignoré si le navigateur bloque les vibrations automatiques
      }
    }
  };

  return {
    lightTap: () => triggerHaptic(15),
    mediumTap: () => triggerHaptic(30),
    heavyTap: () => triggerHaptic(50),
    success: () => triggerHaptic([30, 50, 30]),
    warning: () => triggerHaptic([50, 100, 50]),
    error: () => triggerHaptic([100, 50, 100]),
  };
}