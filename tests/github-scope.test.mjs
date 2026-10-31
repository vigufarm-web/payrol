import test from 'node:test';
import assert from 'node:assert/strict';
test('repository credentials are isolated on one GitHub Pages origin and legacy token cannot shadow shared dataset access',async()=>{
 const values=new Map([['app.token','legacy-gudang-fixture'],['app.repo',JSON.stringify({owner:'vigufarm-web',repo:'gudang',branch:'main'})]]);
 globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};globalThis.location={hostname:'vigufarm-web.github.io',pathname:'/payrol/'};
 const g=await import('../js/github.js');assert.equal(g.ambilToken(),'');assert.equal(g.adaTokenLokal(),false);g.setTokenBersama('payrol-fixture');assert.equal(g.ambilToken(),'payrol-fixture');assert.equal(g.lokasiRepo().repo,'payrol');g.simpanToken('payrol-local-fixture');
 location.pathname='/gudang/';g.setTokenBersama('');assert.equal(g.ambilToken(),'legacy-gudang-fixture');g.simpanToken('gudang-local-fixture');g.setLokasiRepo('vigufarm-web','gudang');
 location.pathname='/payrol/';g.setTokenBersama('payrol-fixture');assert.equal(g.ambilToken(),'payrol-local-fixture');assert.equal(g.lokasiRepo().repo,'payrol');g.simpanToken('');assert.equal(g.ambilToken(),'payrol-fixture');location.pathname='/gudang/';assert.equal(g.ambilToken(),'gudang-local-fixture');
 globalThis.fetch=async(url,options)=>{assert.equal(options.cache,'no-store');return {ok:true,status:200,text:async()=>JSON.stringify({content:btoa('{"fresh":true}'),encoding:'base64',sha:'fixture-sha'})};};assert.deepEqual((await g.bacaFile('data/fixture.json')).isi,{fresh:true});g.simpanToken('');g.setTokenBersama('');assert.equal(g.ambilToken(),'');assert.equal(g.adaTokenLokal(),false);assert.equal(values.has('app.token'),false);
});
