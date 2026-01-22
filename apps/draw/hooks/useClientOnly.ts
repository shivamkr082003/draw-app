import { useEffect, useState } from "react";

export function useClientOnly() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

export function useLocalStorage(
  key: string,
  defaultValue: string | null = null
) {
  const [value, setValue] = useState<string | null>(defaultValue);
  const isClient = useClientOnly();

  useEffect(() => {
    if (isClient && typeof window !== "undefined") {
      const stored = localStorage.getItem(key);
      setValue(stored);
    }
  }, [key, isClient]);

  const setStoredValue = (newValue: string | null) => {
    if (typeof window !== "undefined") {
      if (newValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, newValue);
      }
      setValue(newValue);
    }
  };

  return [value, setStoredValue, isClient] as const;
}
