
// export function debounce(callback: { (arg0: any): any; (arg0: any): any; apply: any; }, delay: number | undefined) {
//     let timeout: string | number | NodeJS.Timeout | undefined;
//     return (...args: any) => {
//         const context = this;
//         clearTimeout(timeout);
//         timeout = setTimeout(() => callback.apply(context, args), delay);
//     }
// }

import _ from 'lodash';

export const debounce = _.debounce;