import { useEffect, useState } from "react";

export interface LocalStorageProps {
  fieldNames: string[];
}

export const LocalStorage: React.FunctionComponent<LocalStorageProps>= ({fieldNames}) => {
  const [objData, _] = useState<{[key: string]: any}>({});
  
  useEffect(() => {
    const localStorageDataOb: {[key: string]: string} = {};
    fieldNames.forEach(key => {
      const value = getOrInitLocalStorage(key, "hello");
      localStorageDataOb[key] = value;
    })
    },
    [fieldNames]
  );

  function getOrInitLocalStorage(field: string, initValue: any) {
    const fieldValue = localStorage.getItem(field);
    if(fieldValue !== null) {
      return fieldValue;
    } else {
      localStorage.setItem(field, initValue);
      return initValue;
    }
  }

  // function clearLocalStorageData() {
  //   console.log("clear localStorage items");
  //   console.log(fieldNames.forEach(key => console.log(key)))
  //   fieldNames.forEach(key => {
  //     localStorage.removeItem(key);
  //   })
  // }
  return (<>
    <h2>LocalStorage</h2>
    <div>
      {Object.keys(objData).map(key => {
        return `${key}: ${objData[key]}`
      })}
    </div>
  </>
  );
}