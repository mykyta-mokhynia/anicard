/**
 * Утилиты для работы с данными
 * Адаптировано из BrilliantLabs
 */

function snakeToCamelObjArray(objArray: any[]) {
  for (let i = 0; i < objArray.length; i++) {
    const obj = objArray[i];
    snakeToCamelObj(obj);
  }
}

/**
 * Преобразует объект из snake_case в camelCase
 */
function snakeToCamelObj(obj: any) {
  if (obj != null && obj != undefined) {
    const keys = Object.keys(obj);
    for (let j = 0; j < keys.length; j++) {
      const oldKey: PropertyKey = keys[j];
      const newKey: PropertyKey = snakeToCamelString(oldKey as string);
      if (oldKey !== newKey) {
        Object.defineProperty(obj, newKey, Object.getOwnPropertyDescriptor(obj, oldKey)!);
        delete obj[oldKey];
      }

      if (typeof obj[newKey] === 'object') {
        snakeToCamelObjArray([obj[newKey]]);
      }
    }
  }
}

function snakeToCamelString(str: string) {
  str = str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  );

  str = str.replace('_', '');
  return str;
}

function camelToSnake(str: string) {
  return str.replace(/[A-Z]/g, (letter, index) => {
    return index == 0 ? letter.toLowerCase() : '_' + letter.toLowerCase();
  });
}

export { snakeToCamelObj, snakeToCamelObjArray, snakeToCamelString, camelToSnake };

