const assert=require('node:assert/strict');
const {Search}=require('./dist/engine.js');
function board(x=[],o=[]){const b=Array(81).fill(0);for(const i of x)b[i]=1;for(const i of o){assert.equal(b[i],0);b[i]=2;}return b;}
function run(b,options={}){const e=new Search(b),before=Array.from(e.b),total=e.total;const r=e.search(2,{timeMs:500,maxDepth:6,...options});assert.deepEqual(Array.from(e.b),before,'Search must restore board');assert.equal(e.total,total,'Search must restore incremental evaluation');assert(r.bestMove===null||b[r.bestMove]===0);assert(Number.isFinite(r.bestScore));return r;}
assert.equal(run(board()).bestMove,40);
for(const [start,step] of [[36,1],[4,9],[0,10],[8,8]]){const b=board();for(let i=0;i<4;i++)b[start+i*step]=1;assert.equal(new Search(b).winner(),null);b[start+4*step]=1;assert.equal(new Search(b).winner(),1);}
assert.equal(run(board([], [0,1,2,3])).bestMove,4,'Win immediately');
assert.equal(run(board([72,73,74,75])).bestMove,76,'Block edge win');
assert.equal(run(board([36,37,39,40])).bestMove,38,'Block broken four');
assert.equal(run(board([0,10,20,30])).bestMove,40,'Block diagonal');
assert.equal(run(board([72,73,74,75],[0,1,2,3])).bestMove,4,'Win before defending');
let r=run(board([0,10],[38,39,40]));assert([37,41].includes(r.bestMove),'Create open four');
r=run(board([38,39,40],[0,10]));assert([37,41].includes(r.bestMove),'Prevent open four');
// Central move creates two simultaneous open fours; no five is present yet.
r=run(board([0,1,9,10],[37,38,39,13,22,31]));assert.equal(r.bestMove,40,'Recognize a fork');
r=run(board([37,38,39,13,22,31],[0,1,9,10]));assert.equal(r.bestMove,40,'Prevent opponent fork');
const b=board([40,41],[30,39]);const e=new Search(b);let total=e.total;e.play(22,2);assert.equal(e.total,new Search(e.b).total);e.undo(22,2);assert.equal(e.total,total);
const left=run(b,{maxDepth:2,timeMs:5000,useAlphaBeta:true});const right=run(b,{maxDepth:2,timeMs:5000,useAlphaBeta:false});assert.equal(left.effectiveDepth,2);assert.equal(right.effectiveDepth,2);assert.equal(left.bestScore,right.bestScore,'Alpha-beta must preserve minimax value at completed depth');
r=run(b,{timeMs:25,maxDepth:20});assert(r.budgetReached,'Must test an interrupted iteration');assert(r.effectiveDepth<20);assert(r.elapsedMs<1000,'Time budget must interrupt unfinished iteration');
console.log('PASS: five-mark rule, immediate wins/blocks, broken threats, open fours, forks, evaluation restoration, alpha-beta and timeout');
console.log('Sample:',{depth:r.effectiveDepth,maxPly:r.maxPly,nodes:r.nodesEvaluated,ms:Math.round(r.elapsedMs)});
