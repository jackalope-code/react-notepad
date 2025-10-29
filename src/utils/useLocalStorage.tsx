import { useEffect, useState } from "react";

// interface UseLocalStorageProps {
//   keyName: string;
//   defaultValue: any;
// }

function useLocalStorage(keyName: string, defaultValue: string) {
  const [state, setState] = useState<string>(defaultValue);
  useEffect(() => {
    const value = localStorage.getItem(keyName);
    if(value === undefined || value === null) {
      setStateAndLocalStorage(defaultValue);
    } else {
      setState(value);
    }
  }, [])
  function setStateAndLocalStorage(value: string) {
    setState(value);
    localStorage.setItem(keyName, value);
  }
  return [state, setStateAndLocalStorage] as [string, typeof setStateAndLocalStorage]
};

export default useLocalStorage;