// Record exactly what reached GitHub, never a later edit made during the request.
export function finishSavedSnapshot(state,{json,data,path,sha,meta}) {
 if(state.data!==data||state.path!==path)return {current:false,pending:false};
 state.sha=sha;state.meta=meta;state.dasarJson=json;
 state.belumDisimpan=JSON.stringify(state.data)!==json;
 return {current:true,pending:state.belumDisimpan};
}
