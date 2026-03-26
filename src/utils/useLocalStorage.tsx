import { useEffect, useState } from "react";

function useLocalStorage<T>(
  keyName: string,
  defaultValue: T,
  serialize: (value: T) => string,
  parse: (raw: string) => T,
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    const raw = localStorage.getItem(keyName);
    if (raw === null || raw === undefined) {
      localStorage.setItem(keyName, serialize(defaultValue));
    } else {
      setState(parse(raw));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setStateAndLocalStorage(value: T) {
    setState(value);
    localStorage.setItem(keyName, serialize(value));
  }

  return [state, setStateAndLocalStorage];
}

export default useLocalStorage;