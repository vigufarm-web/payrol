// Retain the user's date through component redraws, scoped to dataset and permission scope.
const selections=new WeakMap();
export function approvalSelection(data,scope){
 let states=selections.get(data);if(!states){states=new Map();selections.set(data,states);}
 if(!states.has(scope))states.set(scope,{selected:'',perDivision:new Map()});return states.get(scope);
}
export function approvalDateOptions(dates,selected){return [...new Set([...dates,...(selected?[selected]:[])])].sort();}
