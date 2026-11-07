/* Caro 9x9: iterative-deepening negamax, alpha-beta/PVS, late-move reduction, transposition table,
 * incremental evaluation, forced-reply extensions. No external dependencies. */
(function(root){
'use strict';
const N=9, WIN=100000000, INF=1000000000, TIMEOUT=Symbol('timeout');
const lines=[], segments=[], cellLines=Array.from({length:81},()=>[]), cellSegments=Array.from({length:81},()=>[]);
const position=Array.from({length:81},(_,i)=>16-Math.abs((i/9|0)-4)-Math.abs(i%9-4));
for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]])for(let r=0;r<N;r++)for(let c=0;c<N;c++){
 const pr=r-dr,pc=c-dc;if(pr>=0&&pr<N&&pc>=0&&pc<N)continue;
 const line=[];for(let rr=r,cc=c;rr>=0&&rr<N&&cc>=0&&cc<N;rr+=dr,cc+=dc)line.push(rr*N+cc);
 if(line.length<5)continue;const id=lines.length;lines.push(line);for(const i of line)cellLines[i].push(id);
 for(let j=0;j+5<=line.length;j++){const seg=line.slice(j,j+5),sid=segments.length;segments.push(seg);for(const i of seg)cellSegments[i].push(sid);}
}
let seed=0x73a14c2d;function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const hashes=Array.from({length:81},()=>[null,[random(),random()],[random(),random()]]);
const weights=[0,4,65,1100,28000,WIN];
function lineScore(b,line,p){
 const opponent=3-p;let score=0;
 for(let start=0;start+5<=line.length;start++){let own=0,blocked=false;for(let j=0;j<5;j++){const v=b[line[start+j]];if(v===opponent){blocked=true;break;}if(v===p)own++;}if(!blocked)score+=weights[own];}
 // Every full line is scanned, including offset and broken open threes.
 let str='#';for(const i of line)str+=b[i]===p?'P':b[i]===0?'.':'#';str+='#';
 if(str.includes('.PPPP.'))score+=150000;
 for(let i=0;i<str.length;i++){
  if(str.startsWith('.PPP.',i))score+=6500;
  if(str.startsWith('.PP.P.',i)||str.startsWith('.P.PP.',i))score+=4500;
  if(str.startsWith('.PP.',i))score+=180;
 }
 return score;
}
class Search{
 constructor(board){
  if(!board||board.length!==81||Array.from(board).some(v=>v!==0&&v!==1&&v!==2))throw Error('Invalid 9x9 board');
  this.b=Int8Array.from(board);this.empty=0;this.h1=0;this.h2=0;this.total=0;
  this.a=new Int8Array(segments.length);this.x=new Int8Array(segments.length);
  this.lineScores=new Float64Array(lines.length);this.near=new Int16Array(81);
  for(let i=0;i<81;i++)if(this.b[i]){const p=this.b[i];this.h1^=hashes[i][p][0];this.h2^=hashes[i][p][1];this.updateNear(i,1);this.total+=(p===2?1:-1)*position[i];}else this.empty++;
  for(let k=0;k<segments.length;k++)for(const i of segments[k]){if(this.b[i]===1)this.x[k]++;if(this.b[i]===2)this.a[k]++;}
  for(let k=0;k<lines.length;k++){this.lineScores[k]=lineScore(this.b,lines[k],2)-lineScore(this.b,lines[k],1);this.total+=this.lineScores[k];}
  this.tt=new Map();this.nodes=0;this.pruned=0;this.hits=0;this.maxPly=0;this.extensionNodes=0;this.deadline=Infinity;
 }
 updateNear(i,delta){const r=i/9|0,c=i%9;for(let rr=Math.max(0,r-2);rr<=Math.min(8,r+2);rr++)for(let cc=Math.max(0,c-2);cc<=Math.min(8,c+2);cc++)this.near[rr*9+cc]+=delta;}
 play(i,p){this.b[i]=p;this.empty--;this.h1^=hashes[i][p][0];this.h2^=hashes[i][p][1];this.updateNear(i,1);for(const k of cellSegments[i])(p===2?this.a:this.x)[k]++;this.refresh(i,p,1);}
 undo(i,p){this.b[i]=0;this.empty++;this.h1^=hashes[i][p][0];this.h2^=hashes[i][p][1];this.updateNear(i,-1);for(const k of cellSegments[i])(p===2?this.a:this.x)[k]--;this.refresh(i,p,-1);}
 refresh(i,p,d){this.total+=(p===2?1:-1)*position[i]*d;for(const k of cellLines[i]){const next=lineScore(this.b,lines[k],2)-lineScore(this.b,lines[k],1);this.total+=next-this.lineScores[k];this.lineScores[k]=next;}}
 winner(){for(let k=0;k<segments.length;k++){if(this.a[k]===5)return 2;if(this.x[k]===5)return 1;}return this.empty===0?0:null;}
 evaluate(p){return Math.max(-WIN/4,Math.min(WIN/4,this.total))*(p===2?1:-1);}
 winningMoves(p){const own=p===2?this.a:this.x,opp=p===2?this.x:this.a,out=new Set();for(let k=0;k<segments.length;k++)if(own[k]===4&&opp[k]===0)for(const i of segments[k])if(!this.b[i])out.add(i);return [...out];}
 checkTime(){if(performance.now()>=this.deadline)throw TIMEOUT;}
 analyze(i,p){
  const own=p===2?this.a:this.x,opp=p===2?this.x:this.a,winning=new Set();let score=position[i],threes=0;
  for(const k of cellSegments[i])if(opp[k]===0){score+=weights[own[k]+1];if(own[k]===3)for(const j of segments[k])if(j!==i&&!this.b[j])winning.add(j);}
  for(const k of cellLines[i]){let str='#';for(const j of lines[k])str+=j===i||this.b[j]===p?'P':this.b[j]===0?'.':'#';str+='#';if(str.includes('.PPP.')||str.includes('.PP.P.')||str.includes('.P.PP.'))threes++;}
  score+=threes*6500;return {score,wins:winning.size,threes};
 }
 candidates(p,ply=0,preferred=-1){
  const win=this.winningMoves(p);if(win.length)return win.map(i=>({i,rank:INF,forcing:true}));
  const block=this.winningMoves(3-p);if(block.length)return block.map(i=>({i,rank:INF-1,forcing:true}));
  if(this.empty===81)return [{i:40,rank:0,forcing:false}];
  const list=[];for(let i=0;i<81;i++)if(!this.b[i]&&this.near[i]){
   const a=this.analyze(i,p),d=this.analyze(i,3-p);
   let rank=a.score+d.score*1.15;
   if(a.wins>=2)rank+=50000000;else if(d.wins>=2)rank+=40000000;
   if(a.wins===1)rank+=2000000;if(d.wins===1)rank+=1600000;
   if(a.threes>=2)rank+=700000;if(d.threes>=2)rank+=650000;
   list.push({i,rank,forcing:a.wins>0||a.threes>=2,critical:a.wins>0||d.wins>0||a.threes>=2||d.threes>=2});
  }
  list.sort((a,b)=>(b.i===preferred?1:0)-(a.i===preferred?1:0)||b.rank-a.rank||a.i-b.i);
  // Broader at the root. Tactical candidates never disappear at the width limit.
  const limit=ply===0?24:ply<=2?18:14;
  return list.filter((m,k)=>k<limit||m.critical);
 }
 key(p){return (this.h1>>>0)+':'+(this.h2>>>0)+':'+p;}
 negamax(depth,alpha,beta,p,ply,extension){
  this.nodes++;if((this.nodes&63)===0)this.checkTime();this.maxPly=Math.max(this.maxPly,ply);
  const won=this.winner();if(won!==null)return won===0?0:(won===p?WIN-ply:-WIN+ply);
  const wins=this.winningMoves(p);if(wins.length)return WIN-ply-1;
  const blocks=this.winningMoves(3-p);if(blocks.length>1)return -WIN+ply+2;
  // Extend forcing lines past the nominal horizon, up to six extra plies.
  if(depth<=0&&extension<=0)return this.evaluate(p);
  const atHorizon=depth<=0;
  let moves,entry,key,originalAlpha=alpha;
  if(!atHorizon&&this.pruning){key=this.key(p);entry=this.tt.get(key);if(entry&&entry.depth>=depth){this.hits++;const cached=entry.score>WIN/2?entry.score-ply:entry.score<-WIN/2?entry.score+ply:entry.score;if(entry.flag==='exact')return cached;if(entry.flag==='lower')alpha=Math.max(alpha,cached);else beta=Math.min(beta,cached);if(alpha>=beta)return cached;}}
  moves=blocks.length?blocks.map(i=>({i,forcing:true})):this.candidates(p,ply,entry?.best);
  if(atHorizon){this.extensionNodes++;if(!blocks.length){moves=moves.filter(m=>m.forcing);if(!moves.length)return this.evaluate(p);}}
  // At a quiet horizon, retain the static value as a stand-pat option.
  // Forcing moves supplement it; they must not make a quiet defense disappear.
  let best=atHorizon&&!blocks.length?this.evaluate(p):-INF,bestMove=moves[0]?.i;
  alpha=Math.max(alpha,best);
  if(this.pruning&&alpha>=beta)return best;
  for(let k=0;k<moves.length;k++){
   const i=moves[k].i;this.play(i,p);let score;
   try{
    const nextExtension=atHorizon?extension-1:extension;
    if(this.pruning&&k>0){
     // Principal variation search: a null window first, then verify improvements.
     const reduction=depth>=3&&k>=4&&!blocks.length&&!moves[k].critical ? (depth>=6&&k>=8?2:1) : 0;
     score=-this.negamax(depth-1-reduction,-alpha-1,-alpha,3-p,ply+1,nextExtension);
     // Quiet late moves are reduced; every apparent improvement is verified.
     if(reduction&&score>alpha)score=-this.negamax(depth-1,-alpha-1,-alpha,3-p,ply+1,nextExtension);
     if(score>alpha&&score<beta)score=-this.negamax(depth-1,-beta,-alpha,3-p,ply+1,nextExtension);
    }else score=-this.negamax(depth-1,-beta,-alpha,3-p,ply+1,nextExtension);
   }finally{this.undo(i,p);}
   if(score>best){best=score;bestMove=i;}alpha=Math.max(alpha,score);
   if(this.pruning&&alpha>=beta){this.pruned+=moves.length-k-1;break;}
  }
  if(best===-INF)return this.evaluate(p);
  if(key){if(this.tt.size>150000)this.tt.clear();const normalized=best>WIN/2?best+ply:best<-WIN/2?best-ply:best;this.tt.set(key,{depth,score:normalized,best:bestMove,flag:best<=originalAlpha?'upper':best>=beta?'lower':'exact'});}
  return best;
 }
 search(player=2,options={}){
  const start=performance.now(),timeMs=Math.max(25,Math.min(15000,Number(options.timeMs)||4000));
  const maxDepth=Math.max(2,Math.min(20,Number(options.maxDepth)||12));this.pruning=options.useAlphaBeta!==false;this.deadline=start+timeMs;
  const terminal=this.winner();if(terminal!==null)return this.result(null,terminal===0?0:terminal===player?WIN:-WIN,[],0,0,start,timeMs,false,'Ván đã kết thúc');
  let moves=this.candidates(player),best=moves[0].i,score=this.evaluate(player),completed=0,root=[],aborted=false,reason='Tìm kiếm sâu dần';
  const wins=this.winningMoves(player),blocks=this.winningMoves(3-player);
  if(wins.length){best=wins[0];score=WIN-1;root=wins.map(index=>({index,score:(player===2?1:-1)*score,bound:'exact'}));reason='Thắng ngay';return this.result(best,score,root,0,1,start,timeMs,false,reason,player);}
  // Always complete the mandatory block before optional deeper search.
  if(blocks.length){best=blocks[0];reason=blocks.length>1?'Đối thủ có nhiều nước thắng':'Chặn nước thắng bắt buộc';}
  if(this.empty===81)return this.result(40,0,[{index:40,score:0,bound:'exact'}],0,0,start,timeMs,false,'Khai cuộc trung tâm',player);
  for(let depth=1;depth<=maxDepth;depth++){
   const iteration=[];let iterationBest=best,iterationScore=-INF,alpha=-INF;
   moves.sort((a,b)=>(b.i===best?1:0)-(a.i===best?1:0)||b.rank-a.rank);
   try{
    this.checkTime();
    for(const move of moves){
     this.checkTime();this.play(move.i,player);let value;
     try{
      if(this.pruning&&iteration.length){
       value=-this.negamax(depth-1,-alpha-1,-alpha,3-player,1,6);
       if(value>alpha)value=-this.negamax(depth-1,-INF,-alpha,3-player,1,6);
      }else value=-this.negamax(depth-1,-INF,INF,3-player,1,6);
     }finally{this.undo(move.i,player);}
     const bound=this.pruning&&value<=alpha?(player===2?'upper':'lower'):'exact';
     iteration.push({index:move.i,score:value*(player===2?1:-1),bound});
     if(value>iterationScore){iterationScore=value;iterationBest=move.i;}alpha=Math.max(alpha,value);
    }
    best=iterationBest;score=iterationScore;root=iteration;completed=depth;
    if(Math.abs(score)>WIN/2){reason=score>0?'Tìm thấy chuỗi thắng cưỡng bức':'Đối thủ có chuỗi thắng cưỡng bức';break;}
   }catch(e){if(e!==TIMEOUT)throw e;aborted=true;break;}
  }
  if(!root.length)root=[{index:best,score:score*(player===2?1:-1),bound:'estimate'}];
  root.sort((a,b)=>player===2?b.score-a.score:a.score-b.score);
  return this.result(best,score,root,completed,this.maxPly,start,timeMs,aborted,reason,player,maxDepth);
 }
 result(best,score,root,depth,ply,start,budget,aborted,reason,player=2,requested=0){return {bestMove:best,bestScore:score*(player===2?1:-1),rootEvaluations:root,nodesEvaluated:this.nodes,prunedBranches:this.pruned,transpositionHits:this.hits,effectiveDepth:depth,requestedDepth:requested,maxPly:ply,extensionNodes:this.extensionNodes,emptyCount:this.empty,elapsedMs:performance.now()-start,timeBudgetMs:budget,budgetReached:aborted,reason};}
}
const api={Search,WIN,lines,segments};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.CaroEngine=api;
})(typeof self!=='undefined'?self:globalThis);
